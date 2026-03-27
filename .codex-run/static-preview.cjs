const http = require('http')
const fs = require('fs')
const path = require('path')

const root = path.resolve(process.argv[2] || 'dist/renderer')
const port = Number(process.argv[3] || 4173)
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8'
}

function sendFile(filePath, res) {
  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(500)
      res.end(String(error))
      return
    }

    res.writeHead(200, { 'Content-Type': mime[path.extname(filePath).toLowerCase()] || 'application/octet-stream' })
    res.end(data)
  })
}

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0])
  let filePath = path.join(root, urlPath === '/' ? 'index.html' : urlPath)

  if (!filePath.startsWith(root)) {
    res.writeHead(403)
    res.end('Forbidden')
    return
  }

  fs.stat(filePath, (error, stats) => {
    if (!error && stats.isDirectory()) {
      filePath = path.join(filePath, 'index.html')
    }

    fs.access(filePath, fs.constants.F_OK, (accessError) => {
      if (!accessError) {
        sendFile(filePath, res)
        return
      }

      sendFile(path.join(root, 'index.html'), res)
    })
  })
})

server.listen(port, '127.0.0.1', () => {
  console.log(`Static preview ready: http://127.0.0.1:${port}`)
})
