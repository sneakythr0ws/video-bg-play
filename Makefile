FILES := manifest.json \
         video-bg-play-content.js \
         $(wildcard _locales/*/messages.json) \
         icon.svg \
         README.md

video-bg-play.zip: $(FILES) Makefile
	rm -f video-bg-play.xpi
	zip video-bg-play.xpi $(FILES)

lint:
	npm run lint

fix:
	npm run lint:fix && npm run format

format:
	npm run format

validate:
	npm run validate

check:
	npm run check
