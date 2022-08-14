import { AsyncMessager } from './asyncMessager.js';

export class XMPlayer {
    constructor() {
        this.messager = new AsyncMessager(null);
        this.audioctx = null;
        this.gainNode = null;
        this.worker = null;
        this.buffer = null;
        this.xm = {};
    }
 
    async init() {
        if (!this.audioctx) {
            var audioContext = window.AudioContext || window.webkitAudioContext;
            this.audioctx = new audioContext();
            this.gainNode = this.audioctx.createGain();
            this.gainNode.gain.value = 0.1;  // master volume
        }

        if (!this.worker) {
            await this.audioctx.audioWorklet.addModule('/lib/XMProcessor.js');

            this.worker = new AudioWorkletNode(this.audioctx, 'xm-processor');            
            // worklet can re-connect to new port
            this.messager.init(this.worker.port);
        }

        this.gainNode.connect(this.audioctx.destination);

        if (this.buffer) {
            await this.load(this.buffer);
        }
    }

    async load(buffer) {
        if (!this.messager.isActive) {
            this.buffer = buffer;
            return;
        }

        this.buffer = null;

        const data = await this.messager.notify('load', { buffer }, [buffer]);

        this.xm = data;

        return true;
    }

    async play() {
        if (!this.playing) {
            // start playing
            this.worker.connect(this.gainNode);

            // hack to get iOS to play anything
            var temp_osc = this.audioctx.createOscillator();
            temp_osc.connect(this.audioctx.destination);
            !!temp_osc.start ? temp_osc.start(0) : temp_osc.noteOn(0);
            !!temp_osc.stop ? temp_osc.stop(0) : temp_osc.noteOff(0);
            temp_osc.disconnect();
        }

        this.playing = await this.messager.notify('play');
    }

    async pause() {
        if (this.playing) {
            this.worker.disconnect(this.gainNode);
        }

        this.playing = await this.messager.notify('pause');
    }

   async stop() {
        if (this.playing) {
            await this.pause();
        }

        this.init();
    }
}