import { XMPlayer } from './lib/xmWorklet.js';
import { XMView } from './trackview.js';

(function (window, document) {
  const playerInstance = new XMPlayer();

  async function loadXMAndInit(xmdata) {
    if (!await playerInstance.load(xmdata)) {
      return;
    }

    XMView.init(playerInstance);

    var playbutton = document.getElementById("playpause");
    playbutton.innerHTML = 'Play';
    playbutton.onclick = function () {
      if (playerInstance.playing) {
        playerInstance.pause();
        playbutton.innerHTML = 'Play';
      } else {
        playerInstance.play();
        playbutton.innerHTML = 'Pause';
      }
    };
    playbutton.disabled = false;

    return playerInstance.xm;
  }

  function downloadXM(uri) {
    var xmReq = new XMLHttpRequest();
    xmReq.open("GET", uri, true);
    xmReq.responseType = "arraybuffer";
    xmReq.onload = async function (xmEvent) {
      var arrayBuffer = xmReq.response;
      if (arrayBuffer) {
        await loadXMAndInit(arrayBuffer);
      } else {
        console.log("unable to load", uri);
      }
    };
    xmReq.send(null);
  }

  playerInstance.allowDrop = function (ev) {
    ev.stopPropagation();
    ev.preventDefault();
    var elem = document.getElementById("playercontainer");
    elem.className = (ev.type == "dragover" ? "draghover" : "playercontainer");
    return false;
  };

  playerInstance.handleDrop = function (e) {
    console.log(e);
    e.preventDefault();
    var elem = document.getElementById("playercontainer");
    elem.className = "playercontainer";
    var files = e.target.files || e.dataTransfer.files;
    if (files.length < 1) return false;
    var reader = new FileReader();
    reader.onload = async function (e) {
      playerInstance.stop();
      await loadXMAndInit(e.target.result);
    };
    reader.readAsArrayBuffer(files[0]);
    return false;
  };

  function initFilelist() {
    var el = document.getElementById('filelist');
    xmuris.forEach(function (entry) {
      var a = document.createElement('a');
      a.text = entry[0];
      a.href = '#' + entry[1];
      a.onclick = function () {
        el.style.display = "none";
        playerInstance.stop();
        downloadXM(baseuri + entry[1]);
      };
      el.appendChild(a);
      el.appendChild(document.createElement('br'));
    });
    var loadbutton = document.getElementById('loadbutton');
    loadbutton.onclick = function () {
      if (el.style.display == "none") {
        el.style.display = "block";
      } else {
        el.style.display = "none";
      }
    };
  }

  window.onload = function () {
    playerInstance.init();
    initFilelist();

    var uri = location.hash.substr(1);
    if (uri === "") {
      uri = "kamel.xm";
    }
    if (!uri.startsWith("http")) {
      uri = baseuri + uri;
    }
    downloadXM(uri);
  };

})(window, document);
