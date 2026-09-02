export const BEAT_MAP_SCHEMA = 'eclipse.beat-map.v1' as const;
export const MAX_AUDIO_BYTES = 60 * 1024 * 1024;
export const MAX_AUDIO_DURATION_SECONDS = 12 * 60;

export type ShotType = 'Общий план' | 'Средний план' | 'Крупный план' | 'Деталь' | 'Типографика';
export type TransitionType = 'Склейка' | 'По движению' | 'Через затемнение' | 'Световой импульс';

export interface AudioCandidate {
  name: string;
  size: number;
  type: string;
}

export interface EnvelopePoint {
  time: number;
  energy: number;
}

export interface BeatMarker {
  time: number;
  strength: number;
  downbeat: boolean;
}

export interface BeatSection {
  id: string;
  title: string;
  start: number;
  end: number;
  energy: number;
}

export interface ScenePlanItem {
  id: string;
  title: string;
  start: number;
  end: number;
  energy: number;
  shot: ShotType;
  transition: TransitionType;
  note: string;
}

export interface BeatMapProject {
  schemaVersion: typeof BEAT_MAP_SCHEMA;
  source: {
    fileName: string;
    bytes: number;
    duration: number;
    localOnly: true;
    rightsConfirmed: true;
  };
  analysis: {
    bpm: number;
    confidence: number;
    beatCount: number;
    method: 'local-energy-envelope';
  };
  beats: BeatMarker[];
  sections: BeatSection[];
  scenes: ScenePlanItem[];
}

const AUDIO_EXTENSIONS = ['.wav', '.mp3', '.flac', '.m4a', '.aac', '.ogg', '.opus'];
const SHOTS: ShotType[] = ['Общий план', 'Средний план', 'Крупный план', 'Деталь', 'Типографика'];
const TRANSITIONS: TransitionType[] = ['Склейка', 'По движению', 'Через затемнение', 'Световой импульс'];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, precision = 3): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function validateAudioCandidate(candidate: AudioCandidate): void {
  const normalizedName = candidate.name.trim().toLowerCase();
  const hasAudioType = candidate.type.startsWith('audio/');
  const hasAudioExtension = AUDIO_EXTENSIONS.some((extension) => normalizedName.endsWith(extension));
  if (!normalizedName || (!hasAudioType && !hasAudioExtension)) {
    throw new Error('Выберите аудиофайл WAV, MP3, FLAC, M4A, AAC, OGG или Opus.');
  }
  if (!Number.isFinite(candidate.size) || candidate.size <= 0) {
    throw new Error('Аудиофайл пуст или недоступен.');
  }
  if (candidate.size > MAX_AUDIO_BYTES) {
    throw new Error('Файл больше 60 МБ. Для прототипа выберите короткий фрагмент.');
  }
}

export function buildEnergyEnvelope(buffer: AudioBuffer, stepSeconds = 0.025): EnvelopePoint[] {
  const stepSamples = Math.max(1, Math.floor(buffer.sampleRate * stepSeconds));
  const probeStride = Math.max(1, Math.floor(stepSamples / 96));
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index));
  const envelope: EnvelopePoint[] = [];

  for (let start = 0; start < buffer.length; start += stepSamples) {
    let sum = 0;
    let count = 0;
    const end = Math.min(buffer.length, start + stepSamples);
    for (const channel of channels) {
      for (let sample = start; sample < end; sample += probeStride) {
        const value = channel[sample] ?? 0;
        sum += value * value;
        count += 1;
      }
    }
    envelope.push({ time: start / buffer.sampleRate, energy: count ? Math.sqrt(sum / count) : 0 });
  }
  return envelope;
}

function normalizeEnvelope(envelope: EnvelopePoint[]): EnvelopePoint[] {
  const values = envelope.map((point) => Math.max(0, point.energy));
  const floor = median(values);
  const peak = Math.max(...values, floor + Number.EPSILON);
  const range = Math.max(Number.EPSILON, peak - floor);
  return envelope.map((point) => ({
    time: point.time,
    energy: clamp((point.energy - floor) / range, 0, 1),
  }));
}

function detectOnsets(envelope: EnvelopePoint[]): number[] {
  if (envelope.length < 3) return [];
  const values = envelope.map((point) => point.energy);
  const mean = average(values);
  const deviation = Math.sqrt(average(values.map((value) => (value - mean) ** 2)));
  const threshold = clamp(mean + deviation * 0.55, 0.16, 0.72);
  const step = Math.max(0.001, envelope[1].time - envelope[0].time);
  const minGap = Math.max(1, Math.round(0.22 / step));
  const onsets: number[] = [];

  for (let index = 1; index < envelope.length - 1; index += 1) {
    const current = values[index];
    if (current < threshold || current < values[index - 1] || current < values[index + 1]) continue;
    const previousIndex = onsets.at(-1);
    if (previousIndex === undefined || index - previousIndex >= minGap) {
      onsets.push(index);
    } else if (current > values[previousIndex]) {
      onsets[onsets.length - 1] = index;
    }
  }
  return onsets;
}

function estimateTempo(envelope: EnvelopePoint[], onsetIndexes: number[]): { bpm: number; confidence: number; anchor: number } {
  const intervals: number[] = [];
  for (let index = 1; index < onsetIndexes.length; index += 1) {
    const interval = envelope[onsetIndexes[index]].time - envelope[onsetIndexes[index - 1]].time;
    if (interval >= 0.25 && interval <= 1.5) intervals.push(interval);
  }

  let interval = median(intervals) || 0.5;
  let bpm = 60 / interval;
  while (bpm < 78) bpm *= 2;
  while (bpm > 168) bpm /= 2;
  interval = 60 / bpm;

  const consistency = intervals.length
    ? 1 - average(intervals.map((value) => Math.min(1, Math.abs(value - interval) / interval)))
    : 0.28;
  const confidence = clamp(consistency * Math.min(1, onsetIndexes.length / 16), 0.18, 0.98);
  return {
    bpm: Math.round(bpm),
    confidence: round(confidence, 2),
    anchor: onsetIndexes.length ? envelope[onsetIndexes[0]].time : 0,
  };
}

function energyAt(envelope: EnvelopePoint[], time: number): number {
  if (!envelope.length) return 0;
  const step = envelope.length > 1 ? envelope[1].time - envelope[0].time : 0.025;
  const index = clamp(Math.round(time / Math.max(step, 0.001)), 0, envelope.length - 1);
  return envelope[index].energy;
}

function sectionEnergy(envelope: EnvelopePoint[], start: number, end: number): number {
  const values = envelope.filter((point) => point.time >= start && point.time < end).map((point) => point.energy);
  return round(average(values), 2);
}

function buildSections(envelope: EnvelopePoint[], duration: number): BeatSection[] {
  const compact = duration < 45;
  const ratios = compact ? [0, 0.2, 0.55, 0.82, 1] : [0, 0.12, 0.38, 0.68, 0.88, 1];
  const titles = compact
    ? ['Вступление', 'Развитие', 'Основная часть', 'Финал']
    : ['Вступление', 'Развитие', 'Основная часть', 'Разрядка', 'Финал'];
  return titles.map((title, index) => {
    const start = duration * ratios[index];
    const end = duration * ratios[index + 1];
    return {
      id: `section-${index + 1}`,
      title,
      start: round(start),
      end: round(end),
      energy: sectionEnergy(envelope, start, end),
    };
  });
}

function buildScenePlan(sections: BeatSection[]): ScenePlanItem[] {
  const scenes: ScenePlanItem[] = [];
  for (const section of sections) {
    const sectionDuration = section.end - section.start;
    const parts = clamp(Math.ceil(sectionDuration / 14), 1, 3);
    for (let part = 0; part < parts; part += 1) {
      const start = section.start + (sectionDuration * part) / parts;
      const end = section.start + (sectionDuration * (part + 1)) / parts;
      const index = scenes.length;
      scenes.push({
        id: `scene-${index + 1}`,
        title: parts === 1 ? section.title : `${section.title}: фрагмент ${part + 1}`,
        start: round(start),
        end: round(end),
        energy: section.energy,
        shot: SHOTS[index % SHOTS.length],
        transition: index === 0 ? 'Через затемнение' : TRANSITIONS[index % TRANSITIONS.length],
        note: '',
      });
    }
  }
  return scenes.slice(0, 12);
}

export function analyzeEnvelope(
  inputEnvelope: EnvelopePoint[],
  duration: number,
  source: { fileName: string; bytes: number },
): BeatMapProject {
  if (!Number.isFinite(duration) || duration <= 0 || duration > MAX_AUDIO_DURATION_SECONDS) {
    throw new Error('Длительность должна быть больше нуля и не превышать 12 минут.');
  }
  if (inputEnvelope.length < 8) throw new Error('Недостаточно данных для построения бит-карты.');
  const envelope = normalizeEnvelope(inputEnvelope);
  const onsets = detectOnsets(envelope);
  const tempo = estimateTempo(envelope, onsets);
  const period = 60 / tempo.bpm;
  const anchor = tempo.anchor > period ? tempo.anchor % period : tempo.anchor;
  const beats: BeatMarker[] = [];
  let beatIndex = 0;
  for (let time = anchor; time < duration && beats.length < 2400; time += period) {
    beats.push({ time: round(time), strength: round(energyAt(envelope, time), 2), downbeat: beatIndex % 4 === 0 });
    beatIndex += 1;
  }
  const sections = buildSections(envelope, duration);
  return {
    schemaVersion: BEAT_MAP_SCHEMA,
    source: {
      fileName: source.fileName.slice(0, 180),
      bytes: source.bytes,
      duration: round(duration),
      localOnly: true,
      rightsConfirmed: true,
    },
    analysis: {
      bpm: tempo.bpm,
      confidence: tempo.confidence,
      beatCount: beats.length,
      method: 'local-energy-envelope',
    },
    beats,
    sections,
    scenes: buildScenePlan(sections),
  };
}

export function createSyntheticBeatMap(): BeatMapProject {
  const duration = 48;
  const step = 0.025;
  const envelope: EnvelopePoint[] = [];
  for (let time = 0; time < duration; time += step) {
    const beatPhase = time % 0.5;
    const pulse = beatPhase < 0.055 ? 0.9 - beatPhase * 8 : 0.08;
    const sectionLift = time > 9 && time < 34 ? 0.16 : time >= 34 ? 0.08 : 0;
    envelope.push({ time: round(time), energy: clamp(pulse + sectionLift, 0, 1) });
  }
  return analyzeEnvelope(envelope, duration, { fileName: 'synthetic-120-bpm.wav', bytes: 0 });
}

export function serializeBeatMap(project: BeatMapProject): string {
  return `${JSON.stringify(project, null, 2)}\n`;
}
