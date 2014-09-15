#!/bin/sh

GITREV=$(git log -1 --pretty=format:"git%ad.%h" --date=short|sed s/-//g)

rm -rf build
cp -r aima_aimani build
cd build

sed -e "s/\(<\/em:version>\)/.${GITREV}\1/" install.rdf > install.rdf.new && mv install.rdf.new install.rdf
sed -e "s/\(Aima_AimaniVersion = \"[^\"]*\)/\1.${GITREV}/" chrome/content/version.js > chrome/content/version.js.new && mv chrome/content/version.js.new chrome/content/version.js

zip -q -r -9 ../aima_aimani-$GITREV.xpi *
cd ..

rm -rf build/

