# Performance Testing & CI Benchmarks: VORIXA

Every pull request runs automated micro-benchmarks:
* ECS iteration time with 10,000 entities.
* Input bus event dispatch frequency.
* Procedural noise generation latency.
* Bundle size budget verification (warns if production `.js` bundle increases by $> 15\text{KB}$).
