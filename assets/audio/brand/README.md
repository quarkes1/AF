# 开屏名称朗读

`aurora-forge-01.mp3` 与 `aurora-forge-02.mp3` 为用户提供的两段“Aurora Forge”朗读，
用于后续开屏 Logo 演出。原始 MP3 内容与标签完整保留，资源 ID 为
`brand.startup.variant-01`、`brand.startup.variant-02`。

用户确认使用 CosyVoice 2 制作，具体音色及其许可未提供。原标签包含 fish.audio task，
仅作为来源事实保留，不用于推定模型或音色授权。详见 `../provenance.json#brandSpeech`。

两段按用户确认的规则使用：每次应用启动等概率随机选择一段，在开屏 Logo 出现时播放一次，不连续播放两段。允许不同次启动随机到同一版本，不要求轮换。它们属于品牌名称朗读，角色配音
仍未启用。本轮只是素材登记；开屏交互须同步唯一规格后再开发。运行时播放成品文件，
不引入 CosyVoice、Fish Audio、网络语音接口或实时 TTS 依赖。
