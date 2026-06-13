# Real-world prerequisites

The code is far ahead of the real world. This is the honest list of things that must
happen *outside the repo* for each phase to actually matter — so future-you knows the
project is usually blocked on **reality, not more code**.

## Close v0.1 (vegetation indices)
- Fly your actual garden/plot with the DJI Flip on a calm day → generate an
  orthomosaic → run *that* through the pipeline. Confirms the core thesis (RGB indices
  separate vegetation states at ~400 sq ft) on the **real site**, not a borrowed field.
  This is the single most important unproven assumption everything else rests on.

## Unlock v0.2 NDVI
- Acquire a NIR-capable camera (multispectral, or an NIR-converted body). Then extend
  the processor + index enum + UI for NDVI. (The Rust/Python index pipeline is ready.)

## Make v0.3 sensors real
- Acquire LoRa soil-moisture nodes + a gateway → point them at an MQTT broker with
  topic `superintendent/sensors/<node_id>/<band>`, payload `{"value","at"}`, and turn
  off the simulated publisher. The ingest path (broker → Phoenix → channel → UI) is
  already real and proven.

## Put it in front of people / use it yourself
- A deploy target (a small host, or a Cloudflare Tunnel from the local stack), a domain,
  and authentication (issue #15). Until then it's localhost / single-user. A published
  vision doc (GitHub Pages) already covers the "shareable link" need for first contact.

## The bigger picture (the actual venture)
The software demonstrates the vision; these are the real moat, and none of them are code:
- the land or course itself;
- the conservation program (native seed collection, zero synthetic inputs);
- university data partnerships (the Research Hub thesis — outside researchers pushing
  field data into the course record);
- compliance relationships (USDA NRCS / CRP / Audubon).
