// @ts-check
import { AsyncMessager } from './asyncMessager.js';
import { ConvertSample, GetString, UnrollSampleLoop } from './Utils.js';
import { XMEffects, EnvelopeFollower, Envelope } from "./XMEffects.js";


/**
 * @type { AudioWorkletGlobalScope }
 *
 */
const context = globalThis;


class XMProcessor extends AudioWorkletProcessor {
    static processorKey = 'xm-processor';

    constructor() {
        super();
        this.messager = new AsyncMessager(this.port);
        this.isPlayed = false;
        this.xm = {};

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

    _load({ buffer }) {
        var dv = new DataView(buffer);
        this.xm = {};

        this.xm.songname = GetString(dv, 17, 20);
        var hlen = dv.getUint32(0x3c, true) + 0x3c;
        var songlen = dv.getUint16(0x40, true);
        this.xm.song_looppos = dv.getUint16(0x42, true);
        this.xm.nchan = dv.getUint16(0x44, true);
        var npat = dv.getUint16(0x46, true);
        var ninst = dv.getUint16(0x48, true);
        this.xm.flags = dv.getUint16(0x4a, true);
        this.xm.tempo = dv.getUint16(0x4c, true);
        this.xm.bpm = dv.getUint16(0x4e, true);
        this.xm.channelinfo = [];


        // TODO
        // this.xm.global_volume = this.max_global_volume;

        var i, j, k;

        for (i = 0; i < this.xm.nchan; i++) {
            this.xm.channelinfo.push({
                number: i,
                filterstate: new Float32Array(3),
                vol: 0,
                pan: 128,
                period: 1920 - 48 * 16,
                vL: 0, vR: 0,   // left right volume envelope followers (changes per sample)
                vLprev: 0, vRprev: 0,
                mute: 0,
                volE: 0, panE: 0,
                retrig: 0,
                vibratopos: 0,
                vibratodepth: 1,
                vibratospeed: 1,
                vibratotype: 0,
            });
        }
        console.debug("header len " + hlen);

        console.debug("songlen %d, %d channels, %d patterns, %d instruments", songlen, this.xm.nchan, npat, ninst);
        console.debug("loop @%d", this.xm.song_looppos);
        console.debug("flags=%d tempo %d bpm %d", this.xm.flags, this.xm.tempo, this.xm.bpm);

        this.xm.songpats = [];
        for (i = 0; i < songlen; i++) {
            this.xm.songpats.push(dv.getUint8(0x50 + i));
        }
        console.debug("song patterns: ", this.xm.songpats);

        var idx = hlen;
        this.xm.patterns = [];
        for (i = 0; i < npat; i++) {
            var pattern = [];
            var patheaderlen = dv.getUint32(idx, true);
            var patrows = dv.getUint16(idx + 5, true);
            var patsize = dv.getUint16(idx + 7, true);
            console.debug("pattern %d: %d bytes, %d rows", i, patsize, patrows);
            idx += 9;
            for (j = 0; patsize > 0 && j < patrows; j++) {
                let row = [];
                for (k = 0; k < this.xm.nchan; k++) {
                    var byte0 = dv.getUint8(idx); idx++;
                    var note = -1, inst = -1, vol = -1, efftype = 0, effparam = 0;
                    if (byte0 & 0x80) {
                        if (byte0 & 0x01) {
                            note = dv.getUint8(idx) - 1; idx++;
                        }
                        if (byte0 & 0x02) {
                            inst = dv.getUint8(idx); idx++;
                        }
                        if (byte0 & 0x04) {
                            vol = dv.getUint8(idx); idx++;
                        }
                        if (byte0 & 0x08) {
                            efftype = dv.getUint8(idx); idx++;
                        }
                        if (byte0 & 0x10) {
                            effparam = dv.getUint8(idx); idx++;
                        }
                    } else {
                        // byte0 is note from 1..96 or 0 for nothing or 97 for release
                        // so we subtract 1 so that C-0 is stored as 0
                        note = byte0 - 1;
                        inst = dv.getUint8(idx); idx++;
                        vol = dv.getUint8(idx); idx++;
                        efftype = dv.getUint8(idx); idx++;
                        effparam = dv.getUint8(idx); idx++;
                    }
                    var notedata = [note, inst, vol, efftype, effparam];
                    row.push(notedata);
                }
                pattern.push(row);
            }
            this.xm.patterns.push(pattern);
        }

        this.xm.instruments = [];
        // now load instruments
        for (i = 0; i < ninst; i++) {
            var hdrsiz = dv.getUint32(idx, true);
            var instname = GetString(dv, idx + 0x4, 22);
            var nsamp = dv.getUint16(idx + 0x1b, true);

            /**
             * @type { Instrument }
             */
            const inst = {
                name: instname,
                number: i,
                samplemap: null,
                samples: null,
            };

            if (nsamp > 0) {
                var samplemap = new Uint8Array(buffer, idx + 33, 96);

                var env_nvol = dv.getUint8(idx + 225);
                var env_vol_type = dv.getUint8(idx + 233);
                var env_vol_sustain = dv.getUint8(idx + 227);
                var env_vol_loop_start = dv.getUint8(idx + 228);
                var env_vol_loop_end = dv.getUint8(idx + 229);
                var env_npan = dv.getUint8(idx + 226);
                var env_pan_type = dv.getUint8(idx + 234);
                var env_pan_sustain = dv.getUint8(idx + 230);
                var env_pan_loop_start = dv.getUint8(idx + 231);
                var env_pan_loop_end = dv.getUint8(idx + 232);
                var vol_fadeout = dv.getUint16(idx + 239, true);
                var env_vol = [];
                for (j = 0; j < env_nvol * 2; j++) {
                    env_vol.push(dv.getUint16(idx + 129 + j * 2, true));
                }
                var env_pan = [];
                for (j = 0; j < env_npan * 2; j++) {
                    env_pan.push(dv.getUint16(idx + 177 + j * 2, true));
                }
                // FIXME: ignoring keymaps for now and assuming 1 sample / instrument
                // var keymap = getarray(dv, idx+0x21);
                var samphdrsiz = dv.getUint32(idx + 0x1d, true);
                console.debug("hdrsiz %d; instrument %s: '%s' %d samples, samphdrsiz %d",
                    hdrsiz, (i + 1).toString(16), instname, nsamp, samphdrsiz);
                idx += hdrsiz;
                var totalsamples = 0;
                var samps = [];
                for (j = 0; j < nsamp; j++) {
                    var samplen = dv.getUint32(idx, true);
                    var samploop = dv.getUint32(idx + 4, true);
                    var samplooplen = dv.getUint32(idx + 8, true);
                    var sampvol = dv.getUint8(idx + 12);
                    var sampfinetune = dv.getInt8(idx + 13);
                    var samptype = dv.getUint8(idx + 14);
                    var samppan = dv.getUint8(idx + 15);
                    var sampnote = dv.getInt8(idx + 16);
                    var sampname = GetString(dv, idx + 18, 22);
                    var sampleoffset = totalsamples;
                    if (samplooplen === 0) {
                        samptype &= ~3;
                    }

                    /*
                    console.debug("sample %d: len %d name '%s' loop %d/%d vol %d offset %s",
                        j, samplen, sampname, samploop, samplooplen, sampvol, sampleoffset.toString(16));
                    console.debug("           type %d note %s(%d) finetune %d pan %d",
                        samptype, this.prettify_note(sampnote + 12 * 4), sampnote, sampfinetune, samppan);
                    console.debug("           vol env", env_vol, env_vol_sustain,
                        env_vol_loop_start, env_vol_loop_end, "type", env_vol_type,
                        "fadeout", vol_fadeout);
                    console.debug("           pan env", env_pan, env_pan_sustain,
                        env_pan_loop_start, env_pan_loop_end, "type", env_pan_type);

                    */
                    var samp = {
                        'len': samplen, 'loop': samploop,
                        'looplen': samplooplen, 'note': sampnote, 'fine': sampfinetune,
                        'pan': samppan, 'type': samptype, 'vol': sampvol,
                        'fileoffset': sampleoffset
                    };
                    // length / pointers are all specified in bytes; fixup for 16-bit samples
                    samps.push(samp);
                    idx += samphdrsiz;
                    totalsamples += samplen;
                }
                for (j = 0; j < nsamp; j++) {
                    var samp = samps[j];
                    samp.sampledata = ConvertSample(
                        new Uint8Array(buffer, idx + samp.fileoffset, samp.len), samp.type & 16);
                    if (samp.type & 16) {
                        samp.len /= 2;
                        samp.loop /= 2;
                        samp.looplen /= 2;
                    }
                    // unroll short loops and any pingpong loops
                    if ((samp.type & 3) && (samp.looplen < 2048 || (samp.type & 2))) {
                        UnrollSampleLoop(samp);
                    }
                }
                idx += totalsamples;
                inst.samplemap = samplemap;
                inst.samples = samps;
                if (env_vol_type) {
                    // insert an automatic fadeout to 0 at the end of the envelope
                    var env_end_tick = env_vol[env_vol.length - 2];
                    if (!(env_vol_type & 2)) {  // if there's no sustain point, create one
                        env_vol_sustain = env_vol.length / 2;
                    }
                    if (vol_fadeout > 0) {
                        var fadeout_ticks = 65536.0 / vol_fadeout;
                        env_vol.push(env_end_tick + fadeout_ticks);
                        env_vol.push(0);
                    }
                    inst.env_vol = new Envelope(
                        env_vol,
                        env_vol_type,
                        env_vol_sustain,
                        env_vol_loop_start,
                        env_vol_loop_end);
                } else {
                    // no envelope, then just make a default full-volume envelope.
                    // i thought this would use fadeout, but apparently it doesn't.
                    inst.env_vol = new Envelope([0, 64, 1, 0], 2, 0, 0, 0);
                }
                if (env_pan_type) {
                    if (!(env_pan_type & 2)) {  // if there's no sustain point, create one
                        env_pan_sustain = env_pan.length / 2;
                    }
                    inst.env_pan = new Envelope(
                        env_pan,
                        env_pan_type,
                        env_pan_sustain,
                        env_pan_loop_start,
                        env_pan_loop_end);
                } else {
                    // create a default empty envelope
                    inst.env_pan = new Envelope([0, 32], 0, 0, 0, 0);
                }
            } else {
                idx += hdrsiz;
                console.debug("empty instrument", i, hdrsiz, idx);
            }
            this.xm.instruments.push(inst);
        }

        console.debug("loaded \"" + this.xm.songname + "\"");

        return true;
    }


    process(input, output, params) {

        return true;
    }
}

context.registerProcessor(XMProcessor.processorKey, XMProcessor);
