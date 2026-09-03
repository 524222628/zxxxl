const test = require('node:test');
const assert = require('node:assert/strict');
const itinerary = require('../data/itinerary.json');

test('8 天日期、住宿与关键返程安排正确', () => {
  assert.equal(itinerary.days.length, 8);
  assert.equal(itinerary.days[6].date, '2026-10-03');
  assert.match(itinerary.days[6].hotel, /京都七条/);
  const lastDayNames = itinerary.days[7].blocks.map((block) => block.title).join(' ');
  assert.match(lastDayNames, /HARUKA/);
  assert.match(lastDayNames, /UO851/);
});

test('每张行程卡都有页面所需的内容字段', () => {
  for (const day of itinerary.days) {
    assert.ok(day.image && day.imageSource, `${day.id} 缺少图片来源`);
    assert.ok(day.blocks.length > 0, `${day.id} 没有行程卡`);
    for (const block of day.blocks) {
      for (const field of ['id', 'type', 'start', 'end', 'title', 'place', 'action', 'description', 'recommendation', 'status']) {
        assert.ok(block[field], `${block.id} 缺少 ${field}`);
      }
      assert.ok(block.start < block.end, `${block.id} 时间范围无效`);
    }
  }
});

test('公开初始数据不含订单号和联系方式字段', () => {
  const serialized = JSON.stringify(itinerary).toLowerCase();
  assert.equal(serialized.includes('订单号'), false);
  assert.equal(serialized.includes('手机号'), false);
  assert.equal(serialized.includes('邮箱'), false);
});
