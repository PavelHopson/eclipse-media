# Video ad preview and approval contract

`frontend/src/services/videoAdPlanContract.ts` is the Eclipse Media consumer for
`eclipse.video-ad-plan.v1`. Import is local, bounded to 64 KB, rejects unknown fields, validates
the fixed 15-second timeline, and preserves two independent gates:

1. claims and references are reviewed before a render handoff can be prepared;
2. publication still requires a separate manual approval after the rendered file is watched.

No import function invokes a network request, shell, renderer, or publisher. The next UI slice
should show the three-scene preview and three explicit review checkboxes before enabling handoff.
