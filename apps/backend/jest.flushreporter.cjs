const fs = require('fs');
const OUT = process.env.FLUSH_LOG || '/tmp/flush.log';
class FlushReporter {
  onTestResult(test, result) {
    const f = result.testFilePath.replace(/.*\/tests\//, 'tests/');
    let line;
    if (result.testExecError) {
      line = `ERR  ${f} :: ${(result.testExecError.message||'').split('\n')[0]}`;
    } else {
      const p = result.numPassingTests, fl = result.numFailingTests;
      line = `${fl>0?'FAIL':'pass'} ${f} (${p}p/${fl}f)`;
      if (fl>0) {
        for (const tr of result.testResults) {
          if (tr.status==='failed') {
            line += `\n   ✗ ${tr.fullName} :: ${(tr.failureMessages[0]||'').split('\n').slice(0,3).join(' | ')}`;
          }
        }
      }
    }
    fs.appendFileSync(OUT, line+'\n');
  }
  onRunComplete(_c, agg) {
    fs.appendFileSync(OUT, `\n=== DONE suites:${agg.numPassedTestSuites}p/${agg.numFailedTestSuites}f tests:${agg.numPassedTests}p/${agg.numFailedTests}f ===\n`);
  }
}
module.exports = FlushReporter;
