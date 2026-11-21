# Verify the image signature

Release images (`ghcr.io/selfhostr/redfish`, linux/amd64 and linux/arm64) are signed with [cosign](https://docs.sigstore.dev/) keyless, from the release workflow. SBOM and provenance attestations are attached to the image.

```sh
cosign verify ghcr.io/selfhostr/redfish:1.2.3 \
  --certificate-identity-regexp '^https://github.com/selfhostr/redfish/\.github/workflows/release\.yml@refs/tags/v' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
```

A successful run prints the verified signature. Pin the digest (`@sha256:...`) in production.
