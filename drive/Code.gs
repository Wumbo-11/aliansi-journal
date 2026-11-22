/**
 * ALIANSI — backend penyimpanan cerita di Google Drive.
 *
 * Cara pasang:
 * 1. Buka https://script.google.com → New project
 * 2. Hapus isi default, tempel seluruh kode ini, Save
 * 3. Deploy → New deployment → Web app
 *      Execute as:        Me
 *      Who has access:    Anyone
 * 4. Copy Web app URL (.../exec) → kirim ke agen
 *
 * Setiap cerita dibuat sebagai SATU FILE .txt di folder "Aliansi — Cerita".
 * Tiap file dibagi dengan akses "Anyone with the link" (view),
 * jadi setiap cerita punya link Drive sendiri-sendiri.
 */

const FOLDER_NAME = 'Aliansi — Cerita'
const FOLDER_PROP = 'ALIANSI_FOLDER_ID'

function getFolder() {
  const props = PropertiesService.getScriptProperties()
  const savedId = props.getProperty(FOLDER_PROP)

  if (savedId) {
    try {
      return DriveApp.getFolderById(savedId)
    } catch (err) {
      props.deleteProperty(FOLDER_PROP)
    }
  }

  const found = DriveApp.getFoldersByName(FOLDER_NAME)
  const folder = found.hasNext() ? found.next() : DriveApp.createFolder(FOLDER_NAME)
  props.setProperty(FOLDER_PROP, folder.getId())
  return folder
}

function output(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON
  )
}

function parseBody(e) {
  if (!e || !e.postData || !e.postData.contents) return {}
  try {
    return JSON.parse(e.postData.contents)
  } catch (err) {
    return {}
  }
}

function errorMessage(err) {
  return String(err && err.message ? err.message : err)
}

function doGet(e) {
  try {
    const action = e && e.parameter && e.parameter.action ? e.parameter.action : 'list'

    if (action === 'ping') {
      return output({ ok: true, service: 'Aliansi Drive', time: new Date().toISOString() })
    }

    const folder = getFolder()
    const files = folder.getFiles()
    const entries = []

    while (files.hasNext()) {
      const file = files.next()
      try {
        const data = JSON.parse(file.getBlob().getDataAsString())
        if (data && data.id && data.title) {
          entries.push({
            id: data.id,
            title: String(data.title),
            body: String(data.body || ''),
            author: String(data.author || ''),
            category: String(data.category || 'Cerita'),
            createdAt: Number(data.createdAt) || Date.now(),
            link: file.getUrl(),
          })
        }
      } catch (err) {
        // File yang bukan cerita diabaikan.
      }
    }

    entries.sort(function (a, b) {
      return b.createdAt - a.createdAt
    })

    return output({ ok: true, entries: entries })
  } catch (err) {
    return output({ ok: false, error: errorMessage(err) })
  }
}

function doPost(e) {
  try {
    const body = parseBody(e)
    const folder = getFolder()

    if (body.action === 'add') {
      const allowed = ['Cerita', 'Jurnal', 'Renungan']
      const entry = {
        id: Utilities.getUuid(),
        title: String(body.title || '').slice(0, 120),
        body: String(body.body || '').slice(0, 5000),
        author: String(body.author || ''),
        category: allowed.indexOf(body.category) >= 0 ? body.category : 'Cerita',
        createdAt: Number(body.createdAt) || Date.now(),
      }

      if (!entry.title || !entry.body) {
        return output({ ok: false, error: 'Judul dan isi wajib diisi.' })
      }

      const safeTitle = entry.title.replace(/[\\/\n\r]/g, '-')
      const name = new Date(entry.createdAt).toISOString().slice(0, 10) + ' — ' + safeTitle + '.txt'
      const file = folder.createFile(name, JSON.stringify(entry), MimeType.PLAIN_TEXT)

      try {
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW)
      } catch (err) {
        // Beberapa akun melarang sharing publik; file tetap tersimpan.
      }

      const result = {}
      Object.keys(entry).forEach(function (key) {
        result[key] = entry[key]
      })
      result.link = file.getUrl()

      return output({ ok: true, entry: result })
    }

    if (body.action === 'delete') {
      const id = String(body.id || '')
      let file = null
      try {
        file = DriveApp.getFileById(id)
      } catch (err) {
        const candidates = folder.getFiles()
        while (candidates.hasNext()) {
          const candidate = candidates.next()
          try {
            if (JSON.parse(candidate.getBlob().getDataAsString()).id === id) {
              file = candidate
              break
            }
          } catch (ignore) {}
        }
      }
      if (file) {
        const parents = file.getParents()
        if (parents.hasNext() && parents.next().getId() === folder.getId()) {
          file.setTrashed(true)
        }
      }
      return output({ ok: true })
    }

    return output({ ok: false, error: 'Aksi tidak dikenal.' })
  } catch (err) {
    return output({ ok: false, error: errorMessage(err) })
  }
}
