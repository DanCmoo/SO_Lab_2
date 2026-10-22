/**
 * @typedef {{read:boolean, write:boolean, execute:boolean}} Permissions
 * @typedef {{segmentNumber:number, regionId:string, name:string, kind:string, base:number, limitBytes:number, permissions:Permissions}} SegmentDescriptor
 * @typedef {{pageNumber:number, frameNumber:number, usedBytes:number}} PageEntry
 * @typedef {{frameNumber:number, ownerKind:'OS'|'FREE'|'PAGE', programId:string|null, pageNumber:number|null}} Frame
 *
 * config.pageSizeBytes: number|null, significativo solo en PAGING.
 * Program.segmentTable: SegmentDescriptor[], vacío fuera de SEGMENTATION.
 * Program.pageTable: PageEntry[], vacío fuera de PAGING.
 * SimulationState.frames: Frame[], vacío fuera de PAGING.
 * En ambos modos nuevos los residentes conservan start/end/containerId = null.
 * frames es canónico; blocks se deriva con projectFrames y no se edita por separado.
 */
export {};
