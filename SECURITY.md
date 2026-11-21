# Security policy

## Supported versions

| Version                   | Supported |
| ------------------------- | --------- |
| `main` and the latest tag | yes       |
| older tags                | no        |

## Reporting a vulnerability

Use GitHub private vulnerability reporting: <https://github.com/selfhostr/redfish/security/advisories/new>. Never open a public issue for a vulnerability.

Please include the version or commit, the steps to reproduce, the impact you see, and any proof of concept. Do not include real personal data.

We acknowledge a report within 7 days and give an assessment within 14 days. We fix, publish an advisory, and credit you by GitHub handle unless you prefer not to be named.

## Scope

In scope: the application, the worker, the Docker image and the CI configuration in this repository. Of special interest: anything that would let the platform capture credentials, bypass the host isolation between dashboard and tracking, leak secrets stored in the database, or read data across organisations.

Out of scope: using redfish against people who did not agree to it, social engineering of maintainers, and findings that need an already compromised host.
