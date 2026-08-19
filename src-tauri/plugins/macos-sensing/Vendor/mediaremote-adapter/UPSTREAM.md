# Upstream

This directory vendors the Swift fork of `mediaremote-adapter` from
https://github.com/ejbills/mediaremote-adapter at revision
`5b6afde3f501a3da567e23bf7f23d562938a1809`.

The fork is based on https://github.com/ungive/mediaremote-adapter and is
distributed under the BSD 3-Clause license in `LICENSE`.

Local change: `MediaController` accepts explicit helper-library and Perl-script
paths so the adapter can be located in a packaged Tauri application.
