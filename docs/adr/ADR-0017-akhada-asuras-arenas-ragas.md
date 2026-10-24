# ADR-0017: Akhada's Asuras, Arenas of the States, and Ragas

* **Status**: Accepted
* **Date**: 2026-10-24
* **Deciders**: Project owner, working session

## Context

The owner wants every Akhada fighter to be uniquely Indian, with the look and powers of the asuras,
fought in places from different states and tied to the scriptures, with Indian sounds and music.
ADR-0016 shipped the fighter with four recoloured cast members on one arena.

## Decision

* **The roster is the epics' great adversaries, not the gods.** Ravana, Kumbhakarna and Tataka
  (Ramayana), Mahishasura and Raktabija (Devi Mahatmya), Hiranyakashipu and Holika (Bhagavata
  Purana), and Bakasura (Mahabharata). Deities are not made into fighters; the stories are told with
  respect for where they come from.
* **Bodies** are new MakeHuman people built from CC0 assets: bare-chested in dhoti-like harem
  pants, barefoot, with South Asian features. **The asura look is made in code** over them: skin of
  their legend, glowing eyes, horns, a gold mukut, jewellery, a gada, an aura of their power, and
  Ravana's nine further heads as a fan of spectral, crowned heads (copies of his body clipped to a
  box around the head).
* **Powers are data** (a `Kit` on the fighter): power and defense, speed, dash reach, super armour,
  lifesteal, and their own blast (low along the ground, an aimed thrown arc, or straight; fire,
  quake, boulder, blood, gold, shadow or wind).
* **Arenas are stage definitions**: a builder from the arena's kit of parts, three rounds of
  weather and a raga. Varanasi (Uttar Pradesh), Kurukshetra (Haryana), Rameswaram (Tamil Nadu) and
  Jaisalmer (Rajasthan) to start; more states follow the same shape.
* **Music is a raga played live**, original and synthesised: a tanpura drone, a plucked string or a
  flute improvising inside the raga, a tala on tabla, nagara, mridangam or dholak, the shankh at
  FIGHT and temple bells. Each arena has its raga.

## Consequences

* **Positive:** a distinct, culturally grounded roster and setting, all from owned or CC0 assets.
* **Positive:** a new arena or fighter is mostly data plus a small builder.
* **Negative:** the asura features are modelled in code and simpler than sculpted characters;
  extra arms (Ravana's twenty) are not attempted.
* **Negative:** CC0 clothing has no true dhoti or sari; harem pants and a dress stand in.
