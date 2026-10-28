// This CJS bundle and its report assets are authenticated protected-producer inputs.
// No candidate dependency resolution or runtime package downloads are performed.
import vendor from './coverage-vendor/dist/coverage-vendor.cjs';
export const { ts, trace, gen, libCoverage, libReport, reports, convert, parseAstAsync } = vendor;
