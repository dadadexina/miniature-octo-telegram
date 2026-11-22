export function isComposing(event) {
  return Boolean(event?.nativeEvent?.isComposing || event?.isComposing)
}

// 输入法组合输入期间保留原始文本,避免受控组件改写正在组合的字符;
// 组合结束后再套用过滤/截断规则。
export function inputValue(event, transform) {
  const raw = event?.target?.value ?? ''
  return isComposing(event) ? raw : transform(raw)
}
