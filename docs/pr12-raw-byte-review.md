# PR #12 raw-byte verification correction — review only

Production baseline: `d2a91205e0c8974ad298b56b3b744a8588d32319`.
Branch: `review/pr12-raw-byte-verification-r1`.
Delivery proof: `20261027-pr12-raw-bytes-r1`.
No merge, deployment or operational-device update is authorized here.

## Root cause and independent evidence

The previous generator's `canonicalFile()` converted CRLF to LF before hashing JavaScript. Git stores mixed line endings in seven manifest assets. The old HTTP fixture repeated that conversion and rebuilt its worker manifest, so successful tests did not establish that the published bytes matched the digest table.

An independent read of every raw production Git blob and all 72 live GitHub Pages response bodies found **7 manifest mismatches, 0 HTTP-versus-Git mismatches and 0 HTTP failures**. The confirmed Pages configuration publishes `main`, `/`, through the legacy Pages build. At the audited production version, Pages preserved every asset body; the mismatch originated in the generator. Fetch/Response digests refer to bytes after HTTP transport decompression, as in the worker.

| Asset | Incorrect LF-derived SHA-256 | Raw Git and actual Pages response SHA-256 |
|---|---|---|
| Management Intelligence | `2819025525c3642a0b750b76e70afc7b8f70bda0d0bad4b4084370c956d956db` | `0fcacfe9043823f1528e68c5179c59f18b2a14045b9bc8c7b6fd4c2434f228b8` |
| Stock Velocity | `069cab4eec82e59886672720b9bb65fa60e17d3d5d405f7a3b5dfa2b7d084d06` | `edbbefb5c0d20731feb8e99c01ee536ece68b3cf01e56623068d493c320605d0` |

The other five affected assets are Customer Intelligence, Margin Intelligence, Pricing Guidance, Pricing Policy Lab and Portfolio Signals. The independent audit records every expected/Git/HTTP digest, not just the two initially reported files.

## Correction

- `assetBytes()` reads exact staged Git blobs, independently of `core.autocrlf`. It refuses unstaged asset edits; stage intended served-asset changes before generating metadata. It never decodes or normalizes source bytes for the asset manifest. Existing application files are not rewritten.
- The two coupled inline modules now also derive from their raw Git bytes. Only delivery envelopes/base64 copies change; standalone business modules remain byte-identical.
- Regenerate the complete manifest, content-derived worker/assembled-cache identities and new delivery proof. The candidate includes **73 assets**: the existing 72 plus the new helper.
- Use `PR12_RAW_BYTE_UPDATE.html` at a fresh URL so an old worker cannot substitute its already-cached PR #12 helper. Preserve `PR11_DELIVERY_UPDATE.html` exactly.
- Normal HTTP fixtures return exact Git blobs, including the stored worker; they never rebuild its manifest. Only the existing explicit synthetic activation variant is re-signed. Fault responses remain unsigned.
- The worker's SHA-256 verifier, installation algorithm, passive activation and recovery/client guards are unchanged outside generated metadata. A source test proves that equality. Byte-equivalent LF text is deliberately rejected when the manifest pins CRLF bytes.

Developer regeneration sequence: stage intended served-asset edits, run `node tools/build-pr11-delivery.cjs`, stage the generated `index.html` and `sw.js`, then run `node tools/build-pr11-delivery.cjs --check`. No source line-ending rewrite or browser reset is part of this process.

## Validation

The separate review CI runs complete source/unit and Chrome browser suites with loopback-only networking, no external routes, cleared credentials and read-only repository permissions. Final run URL, exact reviewed SHA and complete results are recorded in the PR and Owner report.

Added checks reproduce all seven original strict hash failures from raw production Git bytes; compare every candidate manifest entry and normal fixture against independent Git blobs; audit all 73 actual loopback HTTP bodies with identity, gzip and Brotli transport; reject normalized/one-byte-altered bodies; and prove every protected business/security/sync/recovery blob is identical to production.

Browser coverage reproduces rejection of the original PR #12 worker using raw HTTP responses, then caches its real outer/assembled page and old helper. Main, Shop and Camon synthetic profiles upgrade from that state through the fresh helper URL, wait for natural activation, verify PR #11 APIs/navigation source and reopen offline. Business-record bytes, identity/cursor/sequence, queues/configuration, an IndexedDB sentinel and older caches are preserved. Existing startup guard outcomes are observed before comparison; only the transient status label and capability-check timestamp retain their previously documented normalization. Missing-module, stale-module and stale-shell installation failures remain covered.

## Remaining limits and Owner gate

The corrected candidate has not been deployed to Pages. Its complete HTTP validation uses independent raw Git fixtures plus compression variants; production HTTP evidence establishes the current Pages byte-preservation behavior. After a separately approved deployment, audit the **exact deployed commit** again before device rollout:

`node tools/verify-delivery-http.cjs --base https://fmuniru-gif.github.io/tradeflow-zola/ --ref <approved-commit> --output <evidence.json>`

This performs only static GETs and must report zero Git/manifest/HTTP mismatches across all 73 entries. If Pages/CDN serves stale, mixed or transformed bytes, strict installation rejects the new worker; stop and retain existing application/storage. Do not bypass the digest check.

After separate approval and successful delivery verification, pilot Main, then Shop, then Camon. Use only the new helper URL, wait for the complete verified bundle, close all TradeFlow clients for passive activation, reopen, verify the actual controller/new delivery proof and compare preserved data/identity/queues before resuming normal work. Never clear storage, reset enrollment, delete queues, force activation or use recovery controls for this update.

The external Supabase SDK is unchanged and remains outside the same-origin manifest. Tests prove local state preservation, not live Supabase connectivity. No financial, FIFO, stock, accounting, synchronization, security, recovery, performance or branding logic changes are included.
