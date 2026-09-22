const fs = require('node:fs');
const path = require('node:path');
const base = __dirname;
const dest = base;
fs.mkdirSync(dest, {recursive: true});
const read = name => fs.readFileSync(path.join(base, 'src', name), 'utf8').replace(/\r\n/g, '\n');
const output = read('header.txt') + '\n(function(g) {\n"use strict";\nif (g.RPGMToolkit) return;\n' + read('core.js') + '\n' + read('travel.js') + '\n' + read('tools.js') + '\n' + read('translation.js') + '\nvar TOOLKIT_CSS = ' + JSON.stringify(read('style.css')) + ';\n' + read('settings.js') + '\n' + read('scroll.js') + '\n' + read('ui.js') + '\n' + read('toolbox-ui.js') + '\n})(window);\n';
fs.writeFileSync(path.join(dest, 'RPGMToolkit.js'), output);
console.log(`Plugin built: ${Buffer.byteLength(output).toLocaleString()} bytes`);

fs.copyFileSync(path.join(dest, 'RPGMToolkit.js'), path.resolve(base, '../android/src-tauri/resources/RPGMToolkit.js'));

fs.copyFileSync(path.join(base, 'rgss/RPGMToolkit.rb'), path.resolve(base, '../android/src-tauri/resources/RPGMToolkit.rb'));
