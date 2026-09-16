# Audio Architecture: VORIXA

Audio in VORIXA is built directly on the native browser **Web Audio API**, providing spatial sound localization and procedural sound synthesis without external bloat.

## 1. Node Routing Topology

```text
[Sound Source / Procedural Oscillator / Buffer]
                       ↓
              [PannerNode (3D HRTF)]
                       ↓
             [Submix Gain (SFX/Amb)]
                       ↓
             [Master DynamicsCompressor]
                       ↓
              [AudioContext.destination]
```

## 2. Capabilities
* **HRTF Spatial Panning**: Realistic binaural 3D audio positioning based on camera orientation and relative emitter coordinates.
* **Procedural Ambient Synthesis**: Real-time generative soundscapes (wind resonances, cave rumbles) synthesized using filtered white noise and low-frequency oscillators, eliminating large ambient `.mp3` downloads.
* **Safe Autoplay Handling**: AudioContext automatically unlocks cleanly upon the first user interaction gesture (click/keydown), preventing browser console errors.
