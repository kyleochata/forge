async function runAll(jobs) {
  const results = [];
  jobs.forEach(async (job) => {
    results.push(await job());
  });
  return results;
}
module.exports = { runAll };
