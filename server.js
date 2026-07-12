/**
 * Servidor local de la Bitácora del Año Sabático.
 * No requiere instalar nada (usa solo módulos incluidos en Node.js).
 *
 * Uso:
 *   1. Deja este archivo junto a index.html en la misma carpeta.
 *   2. Corre:  node server.js
 *   3. Abre:   http://localhost:4173
 *
 * Los datos se guardan en "bitacora-db.json" (se crea solo la primera vez)
 * y las fotos como archivos reales dentro de la carpeta "fotos/".
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const DB_FILE = path.join(ROOT, 'bitacora-db.json');
const PHOTOS_DIR = path.join(ROOT, 'fotos');
const PORT = 4173;

const DEFAULT_ROUTINES = {
  'Torso': [
    {name:'Press de banca con barra', sets:4, reps:8, weight:''},
    {name:'Remo con barra', sets:4, reps:8, weight:''},
    {name:'Press militar con barra', sets:3, reps:8, weight:''},
    {name:'Press inclinado con mancuernas', sets:3, reps:10, weight:''},
    {name:'Remo unilateral a una mano con mancuerna', sets:3, reps:10, weight:''},
    {name:'Elevaciones laterales', sets:3, reps:12, weight:''},
    {name:'Extensión de codo en polea', sets:3, reps:12, weight:''}
  ],
  'Piernas': [
    {name:'Sentadillas con barra alta', sets:4, reps:8, weight:''},
    {name:'Peso muerto con barra', sets:3, reps:6, weight:''},
    {name:'Prensa para piernas', sets:3, reps:12, weight:''},
    {name:'Curl de isquios en máquina', sets:3, reps:12, weight:''},
    {name:'Aducciones en máquina', sets:3, reps:15, weight:''},
    {name:'Elevación de talones (Gemelos)', sets:4, reps:15, weight:''},
    {name:'Plancha con desplazamiento', sets:3, reps:10, weight:''}
  ],
  'Cuerpo Completo': [
    {name:'Press de banca y sentadillas (variantes con mancuernas)', sets:3, reps:10, weight:''},
    {name:'Tracción vertical', sets:3, reps:10, weight:''},
    {name:'Curl de bíceps en banco inclinado', sets:3, reps:12, weight:''},
    {name:'Face pull', sets:3, reps:15, weight:''}
  ]
};

function defaultData(){
  return {
    daily:{}, gym:{}, gymRoutines: DEFAULT_ROUTINES,
    math:{}, toefl:{settings:{target:'',examDate:''}, tests:[]},
    cyber:{settings:{certName:'',examDate:''}, logs:[]},
    indep:{months:{}}, photos:{gym:[], indep:[]}
  };
}

function ensureFilesystem(){
  if(!fs.existsSync(DB_FILE)){
    fs.writeFileSync(DB_FILE, JSON.stringify(defaultData(), null, 2));
    console.log('Creado bitacora-db.json con datos por defecto.');
  }
  if(!fs.existsSync(PHOTOS_DIR)) fs.mkdirSync(PHOTOS_DIR);
  ['gym','indep'].forEach(p=>{
    const dir = path.join(PHOTOS_DIR, p);
    if(!fs.existsSync(dir)) fs.mkdirSync(dir, {recursive:true});
  });
}

function readDB(){
  ensureFilesystem();
  try{
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  }catch(e){
    console.error('bitacora-db.json está corrupto, se regenera con datos por defecto.', e);
    const fresh = defaultData();
    fs.writeFileSync(DB_FILE, JSON.stringify(fresh, null, 2));
    return fresh;
  }
}
function writeDB(data){
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function sendJSON(res, code, obj){
  const body = JSON.stringify(obj);
  res.writeHead(code, {'Content-Type':'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body)});
  res.end(body);
}
function readBody(req){
  return new Promise((resolve, reject)=>{
    const chunks = [];
    req.on('data', c=>chunks.push(c));
    req.on('end', ()=>resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,8); }

const MIME = {
  '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8', '.json':'application/json',
  '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.png':'image/png', '.webp':'image/webp'
};

ensureFilesystem();

const server = http.createServer(async (req, res)=>{
  let pathname;
  try{
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  }catch(e){
    return sendJSON(res, 400, {error:'url inválida'});
  }

  try{
    /* ---- API: datos ---- */
    if(pathname === '/api/data' && req.method === 'GET'){
      return sendJSON(res, 200, readDB());
    }
    if(pathname === '/api/data' && req.method === 'POST'){
      const body = await readBody(req);
      let data;
      try{ data = JSON.parse(body); }catch(e){ return sendJSON(res, 400, {error:'JSON inválido'}); }
      writeDB(data);
      return sendJSON(res, 200, {ok:true});
    }

    /* ---- API: subir foto (se guarda como archivo real en /fotos) ---- */
    if(pathname === '/api/photo' && req.method === 'POST'){
      const body = await readBody(req);
      let payload;
      try{ payload = JSON.parse(body); }catch(e){ return sendJSON(res, 400, {error:'JSON inválido'}); }
      const { pillar, date, note, imageBase64 } = payload;
      if(!['gym','indep'].includes(pillar)) return sendJSON(res, 400, {error:'pillar inválido'});
      if(!imageBase64) return sendJSON(res, 400, {error:'falta la imagen'});

      const id = uid();
      const filename = id + '.jpg';
      const filepath = path.join(PHOTOS_DIR, pillar, filename);
      const raw = imageBase64.replace(/^data:image\/\w+;base64,/, '');
      fs.writeFileSync(filepath, Buffer.from(raw, 'base64'));

      const data = readDB();
      if(!data.photos) data.photos = {gym:[], indep:[]};
      if(!data.photos[pillar]) data.photos[pillar] = [];
      const record = { id, date: date || '', note: note || '', img: `/fotos/${pillar}/${filename}` };
      data.photos[pillar].push(record);
      writeDB(data);
      return sendJSON(res, 200, record);
    }

    /* ---- API: borrar foto (borra el archivo real también) ---- */
    if(pathname === '/api/photo/delete' && req.method === 'POST'){
      const body = await readBody(req);
      let payload;
      try{ payload = JSON.parse(body); }catch(e){ return sendJSON(res, 400, {error:'JSON inválido'}); }
      const { pillar, id } = payload;
      const data = readDB();
      const list = (data.photos && data.photos[pillar]) || [];
      const entry = list.find(p=>p.id===id);
      if(entry){
        const filepath = path.join(ROOT, entry.img.replace(/^\//,''));
        if(filepath.startsWith(PHOTOS_DIR) && fs.existsSync(filepath)) fs.unlinkSync(filepath);
        data.photos[pillar] = list.filter(p=>p.id!==id);
        writeDB(data);
      }
      return sendJSON(res, 200, {ok:true});
    }

    /* ---- Archivos estáticos: index.html, fotos/, etc. ---- */
    let filePath = pathname === '/' ? '/index.html' : pathname;
    filePath = path.normalize(path.join(ROOT, filePath));
    if(!filePath.startsWith(ROOT)) return sendJSON(res, 403, {error:'forbidden'});
    if(!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()){
      return sendJSON(res, 404, {error:'no encontrado'});
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {'Content-Type': MIME[ext] || 'application/octet-stream'});
    fs.createReadStream(filePath).pipe(res);

  }catch(e){
    console.error(e);
    sendJSON(res, 500, {error:'error del servidor'});
  }
});

server.listen(PORT, ()=>{
  console.log(`\nBitácora del año sabático corriendo en:  http://localhost:${PORT}\n`);
  console.log(`Datos en:  ${DB_FILE}`);
  console.log(`Fotos en:  ${PHOTOS_DIR}\n`);
  console.log('Deja esta ventana abierta mientras usas la app. Ctrl+C para detener.');
});
