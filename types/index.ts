
declare class AudioWorkletProcessor {
    public readonly port: MessagePort;
    public process(input: Float32Array[][], output: Float32Array[][], params: AudioParamMap): boolean;
}

declare interface AudioWorkletGlobalScope {
    readonly currentFrame: number;
    readonly currentTime: number;
    readonly sampleRate: number;

    registerProcessor(name: string, ctor: any);
}


declare interface Envelope {
    Get(point: number): number;
}

declare interface Sample {
    
}

declare interface Instrument {
    name: string;
    number: number;
    samplemap: Uint8Array | null;
    samples: Sample[] | null;
    env_vol?: Envelope;
    env_pan?: Envelope;
}