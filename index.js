const SerialPort = require('serialport')

let lastByte = null;
let lastSyncByte = null;
let ctrl = null;
let server = null;

/// Reads a single byte from serial port, in promise form.
/// Retries 100 times per second, up to 50 times total.
async function readByte(c = 0){
  return new Promise((a, b) => {
    if (!ctrl.isOpen){b("Serial port is not open"); return;}
    if (c++ > 50){b("Byte read timeout on serial port"); return;}
    if (lastByte !== null){a(lastByte); return;}
    setTimeout(()=>{readByte(c).then(a, b);}, 10);
  });
}

/// Reads a single byte from serial port, in promise form.
/// Retries 100 times per second, up to 50 times total.
async function readSyncByte(c = 0){
  return new Promise((a, b) => {
    if (!ctrl.isOpen){b("Serial port is not open"); return;}
    if (c++ > 50){b("Byte read timeout on serial port"); return;}
    if (lastSyncByte !== null){a(lastSyncByte); return;}
    setTimeout(()=>{readSyncByte(c).then(a, b);}, 10);
  });
}

/// Sends 0xff33cc and checks if the port responds with 0xffcc33.
/// Returns a promise that succeeds if it does, or fails with error message argument if it doesn't.
async function resetState(){
  return new Promise(async (success, failure) => {
    let a;
    lastSyncByte = null;
    ctrl.write([0xff]);
    a = await readSyncByte().catch(failure);
    if (a !== 0xff){
      console.log("Handshake response 1: "+a);
      setTimeout(()=>{resetState().then(success, failure);}, 2000);
      return;
    }
    lastSyncByte = null;
    ctrl.write([0x33]);
    a = await readSyncByte().catch(failure);
    if (a !== 0xcc){
      console.log("Handshake response 2: "+a);
      setTimeout(()=>{resetState().then(success, failure);}, 2000);
      return;
    }
    lastSyncByte = null;
    ctrl.write([0xcc]);
    a = await readSyncByte().catch(failure);
    if (a !== 0x33){
      console.log("Handshake response 3: "+a);
      setTimeout(()=>{resetState().then(success, failure);}, 2000);
      return;
    }
    success();
  });
}

/// Updates an ongoing CRC calculation
function calcCRCPart(inCrc, inData){
  let d = inCrc ^ inData;
  for (let i = 0; i < 8; ++i){
    if ((d & 0x80) != 0){
      d <<= 1;
      d ^= 0x07;
    }else{
      d <<= 1;
    }
  }
  d &= 0xff;
  return d;
}

async function sendButtons(b){
  return new Promise(async (success, failure) => {
    let a = [0,0,8,128,128,128,128,0];
    if (b.left){a[3] = 0;}
    if (b.right){a[3] = 255;}
    if (b.up){a[4] = 0;}
    if (b.down){a[4] = 255;}
    if (b.lleft){a[5] = 0;}
    if (b.lright){a[5] = 255;}
    if (b.lup){a[6] = 0;}
    if (b.ldown){a[6] = 255;}
    if (b.ls && Array.isArray(b.ls)){
      if (b.ls[0] < 0){b.ls[0] = 0;}
      if (b.ls[0] > 255){b.ls[0] = 255;}
      if (b.ls[1] < 0){b.ls[1] = 0;}
      if (b.ls[1] > 255){b.ls[1] = 255;}
      a[3] = b.ls[0];
      a[4] = b.ls[1];
    }
    if (b.rs && Array.isArray(b.rs)){
      if (b.rs[0] < 0){b.rs[0] = 0;}
      if (b.rs[0] > 255){b.rs[0] = 255;}
      if (b.rs[1] < 0){b.rs[1] = 0;}
      if (b.rs[1] > 255){b.rs[1] = 255;}
      a[5] = b.rs[0];
      a[6] = b.rs[1];
    }
    if (b.y){a[1] |= 1;}
    if (b.b){a[1] |= 2;}
    if (b.a){a[1] |= 4;}
    if (b.x){a[1] |= 8;}
    if (b.l){a[1] |= 16;}
    if (b.r){a[1] |= 32;}
    if (b.zl){a[1] |= 64;}
    if (b.zr){a[1] |= 128;}
    if (b.minus){a[0] |= 1;}
    if (b.plus){a[0] |= 2;}
    if (b.lstick){a[0] |= 4;}
    if (b.rstick){a[0] |= 8;}
    if (b.home){a[0] |= 16;}
    if (b.capture){a[0] |= 32;}
    if (b.dup){a[2] = 0;}
    if (b.dupright){a[2] = 1;}
    if (b.dright){a[2] = 2;}
    if (b.ddownright){a[2] = 3;}
    if (b.ddown){a[2] = 4;}
    if (b.ddownleft){a[2] = 5;}
    if (b.dleft){a[2] = 6;}
    if (b.dupleft){a[2] = 7;}
    lastByte = null;
    let crc = 0;
    a.forEach((item, index)=>{crc = calcCRCPart(crc, item);});
    a.push(crc);
    ctrl.write(a);
    let r = await readByte().catch(failure);
    if (r == 0x90){
      return success();
    }
    return failure("Received invalid reply ("+r+") to buttons command!");
  });
}

function gotData(d){
  d.forEach((lb, i)=>{
    switch (lb){
      case 0x90://ACK
        lastByte = lb;
        break;
      case 0xFF://SYNC_START
      case 0xCC://SYNC_1
      case 0x33://SYNC_OK
        lastSyncByte = lb;
        break;
      case 0x92://NACK
        console.log("NACK");
      default:
        lastSyncByte = lb;
        lastByte = lb;
    }
  });
}





const _ = require('lodash'); //used for checking equality between button presses
let queue = []; //Queue of buttons to be pressed, in order
let lastBtns = {}; //Last buttons pressed
let sockets = []; //Currently connected websockets
let holdMode = true;

const WebSocket = require('ws');
/// Start websocket server on port 5353, listen for commands
/// Syntax:
/// buttons;duration_in_millis;label
/// 
/// Buttons may be a space-separated string, or an JSON object string
/// Duration defaults to 100ms
/// The label, if present, is returned back as a message once those buttons have been sent
/// 
/// Alternatively, sending "clear" will clear the current queue immediately
function startWSServer(){
  server = new WebSocket.Server({port: 5353});
  server.on('connection', c => {
    sockets.push(c);
    c.on('close', ()=>{sockets = sockets.filter(s => s !== c);});
    c.on('message', txt => {
      txt.split('\n').forEach((msg) => {
        if (msg == "clear"){queue = []; return;}
        if (msg == "hold"){holdMode = true; return;}
        if (msg == "nohold"){holdMode = false; return;}
        let btns = {};
        let dur = 100;
        let label = "";
        if (msg.indexOf(';') != -1){
          let args = msg.split(';');
          msg = args[0];
          dur = parseInt(args[1]);
          if (!dur){dur = 100;}
          label = args[2];
        }
        if (msg[0] == '{'){
          btns = JSON.parse(msg);
        }else{
          msg.toLowerCase().replace(/[^a-z0-9 :]/gi, '').split(' ').forEach((v) => {
            if (v.substr(0, 3) == "ls:" || v.substr(0, 3) == "rs:"){
              let axis = v.split(':');
              btns[axis[0]] = [parseInt(axis[1]), parseInt(axis[2])];
            }else{
              v = v.replace(/[^a-z]/gi, '');
              if (v){btns[v] = 1;}
            }
          });
        }
        queue.push([btns, dur, label]);
      });
    });
  });
}

/// Queue handler, grabs first buttons in queue and applies them.
async function checkQueue(){
  let btn = [{}, 50, ""];
  if (holdMode && !queue.length){
    setTimeout(checkQueue, 50);
    return;
  }
  if (queue.length){btn = queue.shift();}
  if (_.isEqual(lastBtns, btn[0])){
    //No new buttons? Don't send, just check again later
    setTimeout(checkQueue, btn[1]);
    return;
  }
  lastBtns = btn[0];
  sendButtons(btn[0]).then(()=>{
    //success handler
    if (btn[2] != "" && typeof btn[2] == "string"){
      console.log("Label: "+btn[2]);
      sockets.forEach(c=>{c.send(btn[2]);});
    }
    setTimeout(checkQueue, btn[1]);
  }, (e)=>{
    //error handler
    console.log(e);
    if (btn[2] != "" && typeof btn[2] == "string"){
      console.log("Label: "+btn[2]);
      sockets.forEach(c=>{c.send(btn[2]);});
    }
    setTimeout(checkQueue, btn[1]);
  });
}

//Main loop for communications with serial port that has controller emulator hardware
function mainLoop(tty){
  startWSServer();
  ctrl = new SerialPort(tty, {baudRate:19200}, e =>{
    if (e){
      console.log(e);
      server.close();
      return;
    }
    ctrl.on('data', gotData);
    ctrl.write([0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff], ()=>{
      resetState().then(()=>{
        console.log("Controller initialized!");
        setTimeout(checkQueue, 50);
      }).catch((e)=>{
        console.log("Controller init failure; "+e);
        ctrl.close();
        server.close();
      });
    });
  });
}

if (process.argv.length > 2){
  mainLoop(process.argv[2]);
}else{
  SerialPort.list().then(ports => {
    if (ports.length == 1){
      console.log("Found serial port: "+ports[0].path);
      mainLoop(ports[0].path);
    }else if(ports.length == 0){
      console.error("No serial ports found...? Is it plugged in? Does this account have access rights?");
    }else{
      console.error("There are multiple serial ports to pick from. Please pick one and use it as the first command line argument:");
      ports.forEach(p => console.error(p.path));
    }
  }, console.error);
}

