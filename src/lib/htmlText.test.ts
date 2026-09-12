import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { stripHtml, stripHtmlOrUndefined } from "./htmlText";

describe("htmlText", () => {
  it("br 태그는 개행으로 바뀐다", () => {
    assert.equal(stripHtml("첫 줄<br>둘째 줄"), "첫 줄\n둘째 줄");
    assert.equal(stripHtml("첫 줄<br/>둘째 줄"), "첫 줄\n둘째 줄");
    assert.equal(stripHtml("첫 줄<BR />둘째 줄"), "첫 줄\n둘째 줄");
  });

  it("일반 태그는 내용만 남기고 제거된다", () => {
    assert.equal(
      stripHtml(`<p><b>애플</b>은 <span class="x">스마트폰</span>을 만든다</p>`),
      "애플은 스마트폰을 만든다",
    );
  });

  it("네이버 뉴스 검색의 하이라이트 태그가 제거된다", () => {
    assert.equal(
      stripHtml("<b>애플</b>, 신제품 공개&hellip; &quot;역대 최대&quot;"),
      '애플, 신제품 공개… "역대 최대"',
    );
  });

  it("HTML 엔티티가 디코딩된다", () => {
    assert.equal(
      stripHtml("&quot;AT&amp;T&quot; &#39;s 5 &lt; 10 &hellip;&nbsp;공백"),
      `"AT&T" 's 5 < 10 … 공백`,
    );
  });

  it("엔티티 디코딩은 한 번만 하고 부등호 평문은 보존한다", () => {
    // 이중 인코딩 값은 한 단계만 풀려 텍스트로 남는다(태그로 되살아나 잘리지 않는다).
    assert.equal(stripHtml("&amp;lt;b&amp;gt;굵게&amp;lt;/b&amp;gt;"), "&lt;b&gt;굵게&lt;/b&gt;");
    assert.equal(stripHtml("5 &lt; 10 &gt; 3"), "5 < 10 > 3");
  });

  it("연속 공백과 빈 줄이 정리된다", () => {
    assert.equal(stripHtml("  앞뒤   공백  "), "앞뒤 공백");
    assert.equal(stripHtml("한<br><br><br><br>둘"), "한\n\n둘");
  });

  it("비어있거나 내용이 없는 값은 undefined가 된다", () => {
    assert.equal(stripHtmlOrUndefined(null), undefined);
    assert.equal(stripHtmlOrUndefined(undefined), undefined);
    assert.equal(stripHtmlOrUndefined("<p>&nbsp;</p>"), undefined);
    assert.equal(stripHtmlOrUndefined("<b>내용</b>"), "내용");
  });
});
