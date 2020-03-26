# TINN Web
TINN Web is a super simple web framework for TINN which provides the following functionalities:
* simple functions to ease the processing of HTTP requests
* customizable error handler to generate valid HTTP responses even when things go wrong
* generation of HTTP response
* support for dynamic webpages through `<?js ?>` tag (same as `<?php ?>` tag)
* include functions for dynamic pages equivalent to `require`, `require_once`, `include`, `include_once` of `php`
* web controller to map URLs to pages or request handlers

# Install
Install through the `tinn` `install` command as a local package:
```sh
tinn install tinn_web 
```
Or as a local package by adding the `-g` flag:
```sh
tinn install tinn_web -g
```

# Usage #
See the [wiki page](https://github.com/saveriocastellano/tinn/wiki/TINN-Web)
