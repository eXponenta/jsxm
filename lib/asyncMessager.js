export class AsyncMessager {
    /**
     * 
     * @param {MessagePort} port 
     */
    constructor(port) {
        this.port = port;

        this.port.addEventListener('message', this._onMessage.bind(this));
        this.port.start();

        /**
         * @type {Map<string, (data: any) => void>}
         */
        this._messages = new Map();
        /**
         * @type {Map<string, Array<(data: any) => void>>}
         */
        this._streams = new Map();
        this._id = 0;
    }

    /**
     * @private
     * @param {MessageEvent} event 
     */
    _onMessage(event) {
        const { data, type, id } = event.data;

        const callbacks = this._streams.get(type);
        
        if(callbacks) {
            callbacks.forEach((c) => c(data));
        }

        const resolver = this._messages.get(id);
        this._messages.delete(id);

        if (!resolver && !(callbacks && callbacks.length > 0)) {
            throw new Error('Unknow message:' + type + ' with id:' + id);
        }

        resolver && resolver(data);
    }

    /**
     * 
     * @param {string} type 
     * @param {*} data 
     * @param {Transferable[]} [transferable]
     * @returns { Promise<any>}
     */
    notify(type, data, transferable) {
        const key = type + this._id;
        const promise = new Promise((res) => {
            this._messages.set(key, res);
        });

        this.port.start();
        this.port.postMessage( { type, data, id: key }, transferable ? transferable : undefined);

        return promise;
    }

    /**
     * 
     * @param {string} type 
     * @param {(data: any) => void} callback 
     */
    onStream(type, callback) {
        const pool = this._streams.get(type) || [];

        pool.push(callback);

        this._streams.set(type, pool);

        return this;
    }

    /**
     * 
     * @param {string} type 
     * @param {(data: any) => void} [callback] 
     */
    offStream(type, callback) {

        if (!callback) {
            this._streams.delete(type);
            return;
        }

        const pool = this._streams.get(type);

        if (!pool) {
            return;
        }

        this._streams.set(type, pool.filter(e => e !== callback));

        return this;
    }
}