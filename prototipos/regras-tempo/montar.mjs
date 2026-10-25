// PROTÓTIPO DESCARTÁVEL — gera demo.html com o nucleo.ts compilado embutido.
// Uso: tsc nucleo.ts --target es2022 --module es2022 --strict && node montar.mjs
import { readFileSync, writeFileSync } from 'node:fs'

const nucleo = readFileSync(new URL('./nucleo.js', import.meta.url), 'utf8').replace(/^export /gm, '')
const modelo = readFileSync(new URL('./demo.template.html', import.meta.url), 'utf8')
writeFileSync(new URL('./demo.html', import.meta.url), modelo.replace('/*NUCLEO*/', () => nucleo))
console.log('demo.html gerado')
