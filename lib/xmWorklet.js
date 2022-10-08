// @ts-check
export class XMPlayer {
    constructor() {
        this.audioctx = null;
        this.gainNode = null;
        this.worker = null;
        this.buffer = null;
        this.xm = {};

        this.active = false;

        /**
         * @type { MessagePort }
         */
        this.port = null;
        this.messageId = 0;
        this.tasks = {};

        this.onMessage = this.onMessage.bind(this);
    }

    notify (type, data, transferable, id = null) {
        return new Promise((res) => {
            const messageId = id || this.messageId;

            this.tasks[messageId] = res;

            this.port.postMessage({
                type,
                data,
                messageId,
            }, transferable ? transferable : undefined);
    
            this.messageId ++;    
        });
    }
 
    onMessage({ data: msgData }) {
        const { messageId, data } = msgData;

        if (messageId in this.tasks) {
            this.tasks[messageId](data);
            delete this.tasks[messageId];
        }
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

            // we should re-bound events each worklet instance

            if (this.port) {
                this.port.removeEventListener('message', this.onMessage);
            }

            this.port = this.worker.port;
            this.port.addEventListener('message', this.onMessage);
            this.port.start();
            this.active = true;
        }

        this.gainNode.connect(this.audioctx.destination);

        if (this.buffer) {
            await this.load(this.buffer);
        }
    }

    async load(buffer) {
        if (!this.active) {
            await this.init();
        }

        this.buffer = null;

        const data = await this.notify('load', { buffer }, [buffer]);

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

        this.playing = await this.notify('play');
    }

    async pause() {
        if (this.playing) {
            this.worker.disconnect(this.gainNode);
        }

        this.playing = await this.notify('pause');
    }

   async stop() {
        if (this.playing) {
            await this.pause();
        }

        this.init();
    }
}