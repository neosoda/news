const test = require('node:test');
const assert = require('node:assert/strict');
const { buildEditorial } = require('../services/editorial');
const now = Date.parse('2026-11-25T12:00:00Z');
const article = (id, sourceId, title, hours = 1, category = 'Cloud') => ({id,sourceId,title,date:new Date(now-hours*3600000),category,source:{name:'Source '+sourceId},link:'https://example.com/'+id});
test('cross-source related headlines are grouped without deleting original articles', () => {
    const result = buildEditorial([article(1,1,'Microsoft Azure Kubernetes cluster migration'),article(2,2,'Microsoft Azure Kubernetes cluster migration guide'),article(3,3,'Apple launches new laptop display')],now);
    assert.equal(result.topics.length,1);
    assert.equal(result.topics[0].sourceCount,2);
    assert.equal(result.topics[0].articles.length,2);
});
test('single-source repetition is not a corroborated topic or trend', () => {
    const result = buildEditorial([1,2,3].map(id => article(id,1,'Microsoft Azure Kubernetes cluster migration')),now);
    assert.equal(result.topics.length,0);
    assert.equal(result.trends.length,0);
});
test('trends compare equal windows and ignore future and older articles', () => {
    const result = buildEditorial([article(1,1,'Microsoft Azure Kubernetes cluster migration'),article(2,2,'Microsoft Azure database update'),article(3,3,'Microsoft Azure security patch'),article(4,4,'Microsoft Azure platform changes',30),article(5,5,'Microsoft Azure future event',-1),article(6,6,'Microsoft Azure older event',49)],now);
    const trend = result.trends.find(t=>t.term==='azure');
    assert.equal(trend.current,3);assert.equal(trend.previous,1);assert.equal(trend.delta,2);assert.equal(result.sampleSize,4);
});
