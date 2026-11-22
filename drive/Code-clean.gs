// Aliansi - Google Drive backend
// Deploy: Web app, Execute as: Me, Who has access: Anyone

var FOLDER_NAME = 'Aliansi Cerita'
var FOLDER_PROP = 'ALIANSI_FOLDER_ID'

function getFolder() {
  var props = PropertiesService.getScriptProperties()
  var id = props.getProperty(FOLDER_PROP)
  if (id) {
    try { return DriveApp.getFolderById(id) } catch (e) { props.deleteProperty(FOLDER_PROP) }
  }
  var found = DriveApp.getFoldersByName(FOLDER_NAME)
  var folder = found.hasNext() ? found.next() : DriveApp.createFolder(FOLDER_NAME)
  props.setProperty(FOLDER_PROP, folder.getId())
  return folder
}

function out(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON)
}

function bodyOf(e) {
  if (!e || !e.postData || !e.postData.contents) return {}
  try { return JSON.parse(e.postData.contents) } catch (err) { return {} }
}

function errMsg(err) {
  return String(err && err.message ? err.message : err)
}

function doGet(e) {
  try {
    var action = e && e.parameter && e.parameter.action ? e.parameter.action : 'list'
    if (action === 'ping') {
      return out({ ok: true, service: 'Aliansi Drive', time: new Date().toISOString() })
    }

    var files = getFolder().getFiles()
    var entries = []
    while (files.hasNext()) {
      var file = files.next()
      try {
        var d = JSON.parse(file.getBlob().getDataAsString())
        if (d && d.id && d.title) {
          entries.push({
            id: d.id,
            title: String(d.title),
            body: String(d.body || ''),
            author: String(d.author || ''),
            category: String(d.category || 'Cerita'),
            createdAt: Number(d.createdAt) || Date.now(),
            link: file.getUrl()
          })
        }
      } catch (ignore) {}
    }
    entries.sort(function (a, b) { return b.createdAt - a.createdAt })
    return out({ ok: true, entries: entries })
  } catch (err) {
    return out({ ok: false, error: errMsg(err) })
  }
}

function doPost(e) {
  try {
    var body = bodyOf(e)
    var folder = getFolder()

    if (body.action === 'add') {
      var allowed = ['Cerita', 'Jurnal', 'Renungan']
      var entry = {
        id: Utilities.getUuid(),
        title: String(body.title || '').slice(0, 120),
        body: String(body.body || '').slice(0, 5000),
        author: String(body.author || ''),
        category: allowed.indexOf(body.category) >= 0 ? body.category : 'Cerita',
        createdAt: Number(body.createdAt) || Date.now()
      }
      if (!entry.title || !entry.body) {
        return out({ ok: false, error: 'Judul dan isi wajib diisi.' })
      }

      var name = new Date(entry.createdAt).toISOString().slice(0, 10) + ' - ' + entry.title.replace(/[\\/\n\r]/g, '-') + '.txt'
      var file = folder.createFile(name, JSON.stringify(entry), MimeType.PLAIN_TEXT)
      try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW) } catch (ignore) {}

      var result = {
        id: entry.id,
        title: entry.title,
        body: entry.body,
        author: entry.author,
        category: entry.category,
        createdAt: entry.createdAt,
        link: file.getUrl()
      }
      return out({ ok: true, entry: result })
    }

    if (body.action === 'delete') {
      var id = String(body.id || '')
      var target = null
      try {
        target = DriveApp.getFileById(id)
      } catch (e) {
        var candidates = folder.getFiles()
        while (candidates.hasNext()) {
          var candidate = candidates.next()
          try {
            if (JSON.parse(candidate.getBlob().getDataAsString()).id === id) {
              target = candidate
              break
            }
          } catch (ignore) {}
        }
      }
      if (target) {
        var parents = target.getParents()
        if (parents.hasNext() && parents.next().getId() === folder.getId()) {
          target.setTrashed(true)
        }
      }
      return out({ ok: true })
    }

    return out({ ok: false, error: 'Aksi tidak dikenal.' })
  } catch (err) {
    return out({ ok: false, error: errMsg(err) })
  }
}
