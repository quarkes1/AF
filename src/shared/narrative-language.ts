/** Exact spelling of the real location represented by AF's approved library illustration. */
export const NARRATIVE_LANGUAGE_RULES='默认使用自然中文组织和生成内容；保留用户明确指定的语言。人名、地名沿用原始汉字，不转为拼音后回译。已登记地点名称包括：东南大学四牌楼校区、李文正图书馆、玄武湖、鸡鸣寺、秦淮河。“李文正图书馆”不能写成“梨文正图书馆”或“黎文正图书馆”。没有依据的名称不要猜测。不输出内部思考过程，仅返回规定的结构化结果。'

export function normalizeNarrativeNames(text:string){return text.replace(/(?:梨文正|黎文正|李文政)图书馆/g,'李文正图书馆')}
