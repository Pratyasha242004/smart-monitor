// app.js
// initialize firebase (firebase-config.js must be included first)
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.database();

// Login & signup
async function login() {
  const email = document.getElementById('email').value;
  const pass = document.getElementById('password').value;
  try {
    await auth.signInWithEmailAndPassword(email, pass);
    window.location = 'dashboard.html';
  } catch (e) {
    alert('Login failed: ' + e.message);
  }
}
async function signup(email, pass) {
  try {
    await auth.createUserWithEmailAndPassword(email, pass);
    alert('User created. Login now.');
  } catch (e) {
    alert('Signup: ' + e.message);
  }
}

// Acknowledge alarm (writes to Alerts to clear)
function acknowledge(type) {
  if (type === 'temperature') {
    db.ref('/Alerts/temperatureAlert').set('ACK');
    showTransientNotif('Temperature alarm acknowledged');
  } else if (type === 'light') {
    db.ref('/Alerts/lightAlert').set('ACK');
    showTransientNotif('Light alarm acknowledged');
  }
}

// Utility: show center transient notification
function showTransientNotif(text) {
  const n = document.getElementById('notif');
  n.textContent = text;
  n.classList.remove('hidden');
  setTimeout(()=> n.classList.add('hidden'), 4000);
}

// If dashboard page, setup realtime listeners
if (location.pathname.indexOf('dashboard.html') !== -1) {
  auth.onAuthStateChanged(user => {
    if (!user) location.href = 'index.html';
  });

  const tempEl = document.getElementById('temp');
  const humEl = document.getElementById('hum');
  const lightEl = document.getElementById('light');
  const alarmEl = document.getElementById('alarm');
  const logsEl = document.getElementById('logs');
  const lightTimerEl = document.getElementById('lightTimer');

  // Live values: read latest pushed values under /SensorData/temperature etc.
  const tempRef = db.ref('/SensorData/temperature').limitToLast(1);
  const humRef  = db.ref('/SensorData/humidity').limitToLast(1);
  const lightRef= db.ref('/SensorData/light').limitToLast(1);

  tempRef.on('child_added', snap => {
    const val = snap.val();
    tempEl.innerText = (val !== null) ? (val + ' °C') : '-- °C';
  });
  humRef.on('child_added', snap => {
    const val = snap.val();
    humEl.innerText = (val !== null) ? (val + ' %') : '-- %';
  });
  lightRef.on('child_added', snap => {
    const val = snap.val();
    lightEl.innerText = 'Light: ' + (val || '--');
    // start/stop timer if light on
    if (val === 'ON') {
      lightStart = Date.now();
      startLightTimer();
      // show notification after 5s (demo) or 1 minute in real
      setTimeout(()=> {
        showTransientNotif('Light is ON for a while — consider switching off');
        // show browser notification
        if (Notification.permission === "granted") {
          new Notification("Hostel Monitor", { body: "Light ON detected" });
        } else if (Notification) Notification.requestPermission();
      }, 5000); // change to 60000 for 1 minute
    } else {
      stopLightTimer();
    }
  });

  // Listen Alerts
  const alertsRef = db.ref('/Alerts');
  alertsRef.on('value', snap => {
    const a = snap.val() || {};
    alarmEl.innerText = 'Alarm: ' + ((a.temperatureAlert && a.temperatureAlert !== 'NORMAL') ? a.temperatureAlert : (a.lightAlert && a.lightAlert !== 'LIGHT_OFF' ? a.lightAlert : 'NONE'));
    if (a.temperatureAlert === 'HIGH' || a.lightAlert === 'LIGHT_ON') {
      // visual + sound
      alarmEl.style.color = '#ff6b6b';
      playAlarmSound();
    } else {
      alarmEl.style.color = '#bfefff';
    }
  });

  // Logs: show last 30 entries from temperature pushes (they are child nodes)
  const logsRef = db.ref('/SensorData/temperature').limitToLast(30);
  logsRef.on('value', snap => {
    logsEl.innerHTML = '';
    const data = snap.val();
    if (!data) { logsEl.innerHTML = '<i>No logs</i>'; return; }
    // show as latest first
    const keys = Object.keys(data).reverse();
    keys.forEach(k => {
      const v = data[k];
      const el = document.createElement('div');
      el.textContent = 'T: ' + v;
      logsEl.appendChild(el);
    });
  });

  // light timer helpers
  let lightStart = null;
  let lightTimerId = null;
  function startLightTimer() {
    if (lightTimerId) return;
    lightTimerId = setInterval(()=>{
      const s = Math.floor((Date.now() - lightStart)/1000);
      lightTimerEl.innerText = 'Light ON for: ' + s + 's';
    }, 1000);
  }
  function stopLightTimer() {
    if (lightTimerId) clearInterval(lightTimerId);
    lightTimerId = null;
    lightTimerEl.innerText = 'Light ON for: 0s';
  }

  // play short alarm beep (web audio)
  function playAlarmSound() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = 880;
      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
      o.stop(ctx.currentTime + 0.65);
    } catch (e) { /* some browsers restrict auto-play */ }
  }

  // request notification permission
  if (Notification && Notification.permission !== "granted") {
    Notification.requestPermission();
  }
}