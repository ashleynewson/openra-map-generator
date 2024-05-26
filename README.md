# OpenRA Random Map Generator Prototype (unofficial)

This is a prototype random map generator for OpenRA. It is by no means complete,
but can already generate playable maps.

This project **does not and will never** make use of generative AI.

This prototype is written in JavaScript and can run directly within a browser.

## Setting up locally

1. Checkout the repository.

2. Obtain a copy of https://github.com/OpenRA/OpenRA/blob/bleed/mods/ra/tilesets/temperat.yaml and save it the root of the repository.

3. Run `perl ./compile-tile-info.pl` to generate `temperat-info.json`

4. Serve the repo locally using a web server, e.g. `python -m http.server -b 127.0.0.1 8000`

5. Open it in a browser!

## License

The official license for this project is in the LICENSE file.

In order to maintain the more permissive MIT license for this software, it does
not include any files from the OpenRA project, which uses the more restrictive
(but still open source) GPL 3 license.

Whilst the MIT license is already fairly permissive, and may already be used in
projects with more restrictive licenses, feel free to contact me (or open an
issue) if you would like explicit relicensing for inclusion within your own
project.
