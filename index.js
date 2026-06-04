import chalk from 'chalk'
import { spawn } from 'child_process'
import express from 'express'
import figlet from 'figlet'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import bodyParser from 'body-parser'
import dotenv from 'dotenv'

dotenv.config()

let pairingCode = null
let isConnected = false
let botProcess = null
let botStats = null 
const mongodbUri = process.env.MONGODB_URI || 'mongodb://localhost:27017'
const phoneNumber = '212637904038'

figlet('GURU BOT', { font: 'Ghost' }, (err, data) => { if (!err) console.log(chalk.yellow(data)) })

import rateLimit from 'express-rate-limit'
const app = express()
app.set('trust proxy', 1)
const port = process.env.PORT || 5000

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

app.use(express.static(path.join(__dirname, 'Assets')))
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: true }))

const homeLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 })

app.get('/', homeLimiter, (req, res) => { res.sendFile(path.join(__dirname, 'Assets', 'guru.html')) })
app.get('/pairing-status', (req, res) => { res.json({ pairingCode, connected: isConnected, stats: isConnected ? botStats : null }) })

app.listen(port, () => {
  console.log(chalk.green(`Server running on port ${port}`))
  startBot()
  setInterval(requestBotStats, 30000)
})

function startBot() {
  if (botProcess) return

  console.log(chalk.blue('🤖 Starting GURU Bot...'))
  
  // حل مشكلة المسار: التأكد من استهداف ملف guru.js في المجلد الحالي بشكل صحيح ومتوافق مع Linux
  const scriptPath = path.join(__dirname, 'guru.js')
  
  if (!fs.existsSync(scriptPath)) {
    console.error(chalk.red(`❌ خطأ فادح: لم يتم العثور على ملف guru.js في المسار المخطط له: ${scriptPath}`));
    console.error(chalk.yellow(`يرجى التأكد من تسمية الملف بـ guru.js ووضعه في المجلد الرئيسي للسكربت.`));
    return
  }

  const args = [scriptPath, ...process.argv.slice(2)]
  const env = { ...process.env, MONGODB_URI: mongodbUri, PHONE_NUMBER: phoneNumber, PAIRING_MODE: 'true' }

  botProcess = spawn(process.argv[0], args, {
    stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
    env
  })

  botProcess.on('message', data => {
    if (typeof data === 'object' && data.type === 'pairing-code') {
      pairingCode = data.code
      console.log(chalk.green(`[Pairing Code]: ${pairingCode}`))
    } else if (typeof data === 'object' && data.type === 'connection-status') {
      isConnected = data.connected
    } else if (typeof data === 'object' && data.type === 'stats') {
      botStats = data.stats
    } else {
      if (data === 'reset') {
        botProcess.kill()
        botProcess = null
        setTimeout(startBot, 5000) // ترك مهلة 5 ثوانٍ قبل إعادة التشغيل لتفادي حظر السيرفرات
      }
    }
  })

  botProcess.on('exit', code => {
    botProcess = null
    console.error(chalk.red(`❌ البوت توقف، كود الخروج: ${code}`))
    if (code !== 0) {
      console.log(chalk.yellow('جاري إعادة المحاولة بعد 10 ثوانٍ لتجنب الضغط على السيرفر...'))
      setTimeout(startBot, 10000) // مهلة أمان ممددة
    }
  })

  botProcess.on('error', err => {
    console.error(chalk.red(`Error: ${err}`))
    botProcess.kill()
    botProcess = null
    setTimeout(startBot, 10000)
  })
}

function requestBotStats() { if (botProcess && isConnected) botProcess.send({ type: 'request-stats' }) }
