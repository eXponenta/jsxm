import { AsyncMessager } from './asyncMessager.js';
/**
 * @type { AudioWorkletGlobalScope }
 */
const context = globalThis;

class XMProcessor extends AudioWorkletProcessor {
    static processorKey = 'xm-processor';

    constructor() {
        super();
        this.messager = new AsyncMessager(this.port);
        this.initState = null;
        this.isPlayed = false;

        this.listen();
    }

    listen() {
        const keys = Object.getOwnPropertyNames(Object.getPrototypeOf(this));

        for(const key of keys) {
            if(typeof this[key] === 'function' && key.startsWith('_')) {
                this[key] = this[key].bind(this);
                this.messager.onStream(key.replace('_', ''), this[key]);
            }
        }
    }

    notify(type, data) {
        return this.messager.notify(type, data);
    }

    _init(data) {
        console.log(data);
        this.initState = data;

        return true;
    }

    _play() {
        return this.isPlayed = true;
    }

    _pause() {
        return this.isPlayed = false;
    }

    /**
     * 
     * @param {Float32Array[][]} input
     * @param {Float32Array[][]} output
     * @param {AudioParamMap} params 
     */
    process(input, outputs, params) {

    }
}

context.registerProcessor(XMProcessor.processorKey, XMProcessor);
