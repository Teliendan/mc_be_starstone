// Summaries describe recorded evidence only; they never certify compatibility.
export function summarizeInputTrace(report) {
    const result={windowComplete:report.reason==='complete',neighborMatches:0,nativeHighNeighborLow:0,
        nativeLowNeighborHigh:0,unknownComparisons:0,sourceSelfMismatches:0,
        observedSourceChanges:0,observedBlueChanges:0};
    let source=report.initial.on,blue=report.initial.starOn;
    for(const sample of report.samples) {
        if(sample.self===null) result.unknownComparisons++;
        else {
            const native=sample.self>0,adjacent=sample.max>0;
            if(sample.on!==native) result.sourceSelfMismatches++;
            if(!sample.complete&&!adjacent) result.unknownComparisons++;
            else if(native===adjacent) result.neighborMatches++;
            else if(native) result.nativeHighNeighborLow++;
            else result.nativeLowNeighborHigh++;
        }
        if(sample.on!==source) result.observedSourceChanges++;
        if(sample.starOn!==blue) result.observedBlueChanges++;
        source=sample.on;blue=sample.starOn;
    }
    return result;
}
