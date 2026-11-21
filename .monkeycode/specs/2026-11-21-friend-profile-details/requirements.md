# Requirements Document

## Introduction

本需求为「纸墨信笺」补齐好友资料与个人资料能力：好友资料页支持私有备注、性别、加好友时间与方式、来纸墨天数；个人编辑资料支持设置性别并展示固定注册日期；聊天、通讯录、朋友圈的头像统一进入好友资料页。

## Glossary

- **好友资料页**：路由 `/friend/:userId` 对应的个人资料页面。
- **私有备注**：当前登录用户为某位好友设置、仅本人可见的称呼。
- **加好友方式**：好友关系建立时使用的搜索来源，取值包含 ID、邮箱、手机号、推荐好友。
- **来纸墨天数**：从账号注册日期起算、注册当天记为第 1 天的自然日数量。

## Requirements

### Requirement 1

**User Story:** AS 用户，I want 从聊天、通讯录、朋友圈点击好友头像进入好友资料页，so that 我可以快速查看对方资料。

#### Acceptance Criteria

1. WHEN 用户在聊天窗口点击对方消息头像，THE System SHALL 打开该好友的资料页。
2. WHEN 用户在通讯录点击好友头像，THE System SHALL 打开该好友的资料页。
3. WHEN 用户在朋友圈动态点击好友头像，THE System SHALL 打开该好友的资料页。
4. WHEN 用户点击自己的头像，THE System SHALL 打开我的页面。

### Requirement 2

**User Story:** AS 用户，I want 给好友设置私有备注，so that 我可以用熟悉的称呼识别好友。

#### Acceptance Criteria

1. WHEN 用户在好友资料页提交 1 至 20 个字符的备注，THE System SHALL 保存备注并立即更新资料页称呼。
2. WHILE 当前用户已为好友设置备注，THE System SHALL 在通讯录、会话列表、聊天标题、朋友圈作者名称中显示该备注。
3. WHEN 备注云端保存失败，THE System SHALL 保留本机备注并向用户显示失败原因。
4. WHEN 用户清空备注并保存，THE System SHALL 恢复显示好友昵称。

### Requirement 3

**User Story:** AS 用户，I want 在好友资料页查看性别、加好友时间、加好友方式和来纸墨天数，so that 我能了解好友的基本信息。

#### Acceptance Criteria

1. WHEN 好友资料页展示性别，THE System SHALL 显示好友设置的性别；好友未设置时显示“保密”。
2. WHEN 好友资料页展示加好友信息，THE System SHALL 显示好友关系的建立日期和加好友方式。
3. IF 好友关系缺少加好友方式记录，THE System SHALL 显示“未知”。
4. WHEN 好友资料页展示来纸墨天数，THE System SHALL 按注册日期计算天数并在注册当天显示 1 天。
5. IF 好友注册日期缺失，THE System SHALL 显示“未知”。

### Requirement 4

**User Story:** AS 用户，I want 在编辑资料中设置性别并查看注册日期，so that 好友能看到我的性别且注册日期保持可信。

#### Acceptance Criteria

1. WHEN 用户在编辑资料选择“男”“女”或“保密”并保存，THE System SHALL 保存性别并在好友资料页展示。
2. WHEN 用户打开编辑资料，THE System SHALL 以只读方式显示账号注册日期。
3. WHEN 用户未设置性别，THE System SHALL 将性别保存为“保密”。

### Requirement 5

**User Story:** AS 系统，I want 记录新好友的加好友方式，so that 好友资料页能展示真实来源。

#### Acceptance Criteria

1. WHEN 用户通过 ID 搜索发送好友请求，THE System SHALL 记录来源为 ID。
2. WHEN 用户通过邮箱或手机号搜索发送好友请求，THE System SHALL 记录对应搜索来源。
3. WHEN 用户通过推荐好友发送好友请求，THE System SHALL 记录来源为推荐好友。
4. WHEN 好友请求被接受，THE System SHALL 将来源写入双方好友关系。
