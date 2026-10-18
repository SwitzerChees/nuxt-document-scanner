import { existsSync, readFileSync } from 'node:fs'

const resolveHttpsValue = (value?: string) => {
  if (!value) return undefined
  return existsSync(value) ? readFileSync(value, 'utf8') : value
}

const httpsCert = resolveHttpsValue(process.env.SSL_CERT)
const httpsKey = resolveHttpsValue(process.env.SSL_KEY)

export default defineNuxtConfig({
  modules: ['../src/module'],
  devtools: { enabled: false },
  sourcemap: {
    server: true,
    client: true,
  },
  devServer: {
    https: httpsCert && httpsKey
      ? {
          cert: httpsCert,
          key: httpsKey,
        }
      : undefined,
  },
  compatibilityDate: '2026-05-21',
})
