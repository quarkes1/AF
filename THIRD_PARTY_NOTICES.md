# Third-party notices

This file records third-party resources actually present in the repository.
The reuse research in the design specification does not mean that every
researched dependency has already been installed or distributed.

## Source Han Sans SC VF 2.005

- Copyright: Adobe, with Reserved Font Name Source.
- Upstream: https://github.com/adobe-fonts/source-han-sans
- Resource: `assets/fonts/source-han-sans/SourceHanSansSC-VF.ttf`
- License: SIL Open Font License 1.1, reproduced in
  `assets/fonts/source-han-sans/OFL.txt`.
- The original variable TTF is redistributed unmodified. The CSS family alias
  does not rename or alter the font binary. UI uses weights 400, 500 and 700.
- Exact retrieval URL and SHA-256: `assets/fonts/sources.json`.

## Inter 4.1

- Copyright: The Inter Project Authors; Rasmus Andersson.
- Upstream: https://github.com/rsms/inter/tree/v4.1
- Resources: `assets/fonts/inter/InterVariable.woff2` and
  `assets/fonts/inter/InterVariable-Italic.woff2`.
- License: SIL Open Font License 1.1, reproduced in
  `assets/fonts/inter/OFL.txt`.
- Both upstream WOFF2 files are redistributed unmodified.
- Exact retrieval URLs and SHA-256: `assets/fonts/sources.json`.

## KaTeX 0.19.1 font and stylesheet resources

- Stylesheet copyright: Khan Academy and other contributors. Font-binary
  notices identify Design Science, Inc. and Khan Academy.
- Upstream: https://github.com/KaTeX/KaTeX
- Package: https://registry.npmjs.org/katex/-/katex-0.19.1.tgz
- Resources: `assets/fonts/katex/katex.min.css` and
  `assets/fonts/katex/fonts/`.
- Stylesheet license: MIT, reproduced in `assets/fonts/katex/LICENSE`.
- Font-binary license: SIL Open Font License 1.1, as identified in the actual
  OpenType name records 13 and 14. The license and reserved font names are
  reproduced in `assets/fonts/katex/OFL.txt`; original embedded notices are
  preserved in `assets/fonts/katex/font-notices.json`.
- The stylesheet and its complete TTF/WOFF/WOFF2 font set are redistributed
  unmodified from the verified package archive. This asset preparation does
  not install or claim to implement the KaTeX rendering engine. Future engine
  integration must use this same version, or update the fonts and stylesheet
  together with their source records.
- Package integrity and per-file SHA-256: `assets/fonts/sources.json`.

## Project resources

The AF outline icon paths are original project code under the MIT notice in
`assets/icons/LICENSE`. No third-party icon pack or audio pack has been added.
The approved AF logo and Aurore sprites retain their existing project review
records. Generated background artwork has its own generation/reference record
in `assets/backgrounds/provenance.json`; it is not covered by a font license.
Audio selection remains owned by the project owner. Approved home music and SFX, together with rejected procedural BGM records,
are listed in `assets/audio/manifest.json`. User approval of audio quality does
not grant additional redistribution or relicensing rights.

## GeneralUser GS 2.0.3 — instrument used for BGM rendering

- Upstream: https://github.com/mrbumpy409/GeneralUser-GS
- Author: S. Christian Collins. Custom GeneralUser GS License v2.0.
- Original full notice: `assets/audio/licenses/GeneralUser-GS-LICENSE.txt`.
- The license permits private and commercial music creation; it includes the
  author's sample-provenance caveat, retained without alteration.
- Used offline to render original AF scores; neither the SoundFont bank nor
  the renderer is included in runtime assets. This is not a third-party OST
  pack, and the instrument license is not represented as MIT.
- TinySoundFont 0.3.7 (MIT) was used offline only. Source, version and bank hash
  are recorded in `assets/audio/provenance.json`.
- No user-provided commercial OST recordings, samples, or transcriptions are
  distributed. Review-state audio must not be treated as approved material.

## Suno free-account home music

- Tracks: 新しい朝の光; 君と紡ぐ日々 (与你编织的日常).
- Files: `assets/audio/bgm/suno-home-01.mp3` and `suno-home-02.mp3`.
- Made with Suno; supplied and approved by the project owner on 2026-10-27.
- User confirmed both were generated on the free account tier.
- Official scope: personal, non-commercial use. These recordings are not
  licensed under the project's MIT policy. This import does not establish
  permission for public repository/package distribution or competition use.
- Sources checked on 2026-10-27: https://help.suno.com/en/articles/9601601
  and https://suno.com/terms (effective September 3, 2026).
- Original MP3 bytes, embedded cover, and Suno metadata are retained.
- Source song IDs, original hashes and technical checks are recorded in
  `assets/audio/provenance.json` under `sunoTracks`.

## Suno paid-subscription scene music

- Tracks: 窓辺の余白; 何気ない宝物; 言葉になる前に; 昨日より、少し先へ.
- User selected and supplied these tracks on 2026-10-27 and confirmed an
  active paid subscription during generation; exact paid tier not supplied.
- Original MP3 bytes and Suno metadata are preserved. Source hashes, song IDs,
  and usage records: `assets/audio/provenance.json#sunoTracks`.
- Applicable paid-output and permitted-download terms: https://suno.com/terms
  and https://help.suno.com/en/articles/9601665 (checked 2026-10-27).
- Keep these records separate from the first two free-account home tracks.
  No automatic project-wide MIT relicensing is asserted.

## User-provided brand pronunciation

- Two supplied recordings of the brand name Aurora Forge, retained byte for byte
  in `assets/audio/brand/aurora-forge-01.mp3` and `aurora-forge-02.mp3`.
- User identifies the synthesis model as CosyVoice 2. Original files contain
  fish.audio task tags; those tags are preserved but do not establish the
  synthesis model, voice identity, or voice license.
- Specific voice/preset and usage terms were not supplied. Do not infer their
  authorization or copyright status from the model's name or software license.
- Intended for a later splash-logo sequence, not character dialogue. The user selected equal-probability random playback of one
  variant per application launch at logo appearance; no runtime TTS dependency added.
- Full records: `assets/audio/provenance.json#brandSpeech`.
