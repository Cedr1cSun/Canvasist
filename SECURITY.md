# Security policy

Canvasist handles school sign-in sessions, so security reports are taken seriously.

## Reporting a vulnerability

Please **do not** open a public issue. Instead, use GitHub's private
[**Report a vulnerability**](../../security/advisories/new) form on this repository.

Include what you found, how to reproduce it, and its impact. You can expect an
acknowledgement within a few days and a fix or mitigation plan as soon as the
problem is understood.

Never include real session cookies, passwords, or other personal data in a
report; describe the issue with placeholders instead.

## Scope

In scope: the Canvasist desktop app and its build configuration in this
repository, for example leaks of session data, ways for web content to reach
Canvasist's internal commands, unsafe storage of local data, or ways to make
Canvasist install an update that was not signed by its maintainer.

Out of scope: vulnerabilities in Canvas, Gradescope, your school's sign-in
system, Windows or WebView2 themselves. Please report those to their vendors.

## Update signing

Releases are signed with a private key that stays offline on the maintainer's
computer and is never stored on GitHub. Canvasist installs an update only when
its signature matches the public key built into the app and names the version
being installed.

## Supported versions

Only the latest release receives security fixes.
