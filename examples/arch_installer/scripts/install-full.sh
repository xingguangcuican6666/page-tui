#!/bin/sh
set -eu

# 完整安装脚本入口。
# 这里先只保留变量说明和占位退出，你后续在这里写完整安装逻辑。
#
# 环境变量说明：
#   INSTALL_PROFILE
#     类型：字符串。
#     当前脚本固定值：full。
#     示例：
#       if [ "$INSTALL_PROFILE" = "full" ]; then
#         echo "running full install"
#       fi
#
#   INSTALL_PROFILE_LABEL
#     类型：字符串。通常是“完整安装”。
#     用法：只适合显示日志，不建议作为逻辑判断条件。
#
#   INSTALL_PROFILE_CUSTOM
#     类型：字符串布尔值，只会是 true 或 false。
#     当前脚本固定值：false。
#     示例：
#       if [ "$INSTALL_PROFILE_CUSTOM" = "false" ]; then
#         echo "fixed full profile"
#       fi
#
#   SYSTEM_LANG
#     类型：字符串。例子：zh_CN.UTF-8、en_US.UTF-8。
#     用法：写入目标系统 locale 配置。
#
#   SYSTEM_KEYMAP
#     类型：字符串。例子：us、de、fr、jp、uk。
#     用法：写入目标系统键盘配置。
#
#   ROOT_PARTITION_LINE
#     类型：字符串。
#     格式：设备路径  容量  当前文件系统  当前挂载点。
#     例子：/dev/nvme0n1p2  120G  btrfs  -。
#     用法：ROOT_DEVICE="$(first_field "$ROOT_PARTITION_LINE")"。
#
#   ROOT_MOUNT_POINT
#     类型：字符串。当前固定为 /mnt。
#
#   ROOT_FORMAT
#     类型：字符串枚举。
#     可能值：preserve、ext4、btrfs、xfs、vfat、swap。
#     含义：用户选择的目标格式化方式，不是当前文件系统。
#     完整安装建议只允许 preserve/ext4/btrfs/xfs：
#       case "$ROOT_FORMAT" in
#         preserve) ;;
#         ext4) mkfs.ext4 "$ROOT_DEVICE" ;;
#         btrfs) mkfs.btrfs -f "$ROOT_DEVICE" ;;
#         xfs) mkfs.xfs -f "$ROOT_DEVICE" ;;
#         *) echo "invalid root format: $ROOT_FORMAT" >&2; exit 2 ;;
#       esac
#
#   BOOT_PARTITION_LINE
#     类型：字符串。
#     格式同 ROOT_PARTITION_LINE。
#     用法：BOOT_DEVICE="$(first_field "$BOOT_PARTITION_LINE")"。
#
#   BOOT_MOUNT_POINT
#     类型：字符串。当前固定为 /mnt/boot。
#
#   BOOT_FORMAT
#     类型：字符串枚举。
#     可能值：preserve、ext4、btrfs、xfs、vfat、swap。
#     UEFI 常见值是 vfat；保留已有 EFI 分区时用 preserve。
#     示例：
#       case "$BOOT_FORMAT" in
#         preserve) ;;
#         vfat) mkfs.fat -F32 "$BOOT_DEVICE" ;;
#         ext4) mkfs.ext4 "$BOOT_DEVICE" ;;
#         *) echo "invalid boot format: $BOOT_FORMAT" >&2; exit 2 ;;
#       esac
#
#   MOUNT_PLAN_COUNT
#     类型：数字字符串。
#     含义：已保存的分区配置数量。
#     示例：
#       if [ "$MOUNT_PLAN_COUNT" -lt 2 ]; then
#         echo "missing root or boot mount plan" >&2
#         exit 2
#       fi
#
#   MOUNT_PLAN_TSV
#     类型：多行字符串。
#     含义：完整挂载计划，每行一个分区配置，适合遍历 /home、swap、自定义挂载点。
#     字段：分区整行文本<TAB>挂载类型<TAB>挂载点<TAB>格式化方式。
#     挂载类型可能值：none、root、boot、home、swap、custom。
#     挂载点：root=/mnt，boot=/mnt/boot，home=/mnt/home，swap=swap，自定义为用户输入路径，none 为 -。
#     格式化方式可能值：preserve、ext4、btrfs、xfs、vfat、swap。
#     遍历模板：
#       tab="$(printf '\t')"
#       printf '%s' "$MOUNT_PLAN_TSV" |
#       while IFS="$tab" read -r partition_line mount_kind mount_point format; do
#         [ -n "$partition_line" ] || continue
#         device="$(first_field "$partition_line")"
#         case "$mount_kind" in
#           none) continue ;;
#           root|boot|home|swap|custom) ;;
#           *) echo "invalid mount kind: $mount_kind" >&2; exit 2 ;;
#         esac
#         printf 'device=%s mount=%s point=%s format=%s\n' "$device" "$mount_kind" "$mount_point" "$format"
#       done
#
#   NEW_USER
#     类型：字符串。目标系统普通用户名。
#
#   NEW_USER_PASSWORD
#     类型：字符串。普通用户密码。不要写入日志。
#
#   ROOT_PASSWORD
#     类型：字符串。最终 root 密码。设置 root 密码时直接用这个变量。
#
#   ROOT_PASSWORD_SAME_AS_USER
#     类型：字符串布尔值，只会是 true 或 false。
#     示例：
#       if [ "$ROOT_PASSWORD_SAME_AS_USER" = "true" ]; then
#         echo "root password is same as user password"
#       fi
#
#   HOSTNAME
#     类型：字符串。目标主机名。
#
# 本脚本内部变量：
#   first_field()              提取 lsblk 行的第一个字段
#   ROOT_DEVICE                / 分区设备路径
#   BOOT_DEVICE                /boot 分区设备路径
#
# 包选择说明：
#   完整安装不接收 INSTALL_PACKAGES_CSV；桌面环境和常用包直接在本脚本里定义。
#
# 推荐的兜底校验模板：
#   if [ -z "$ROOT_DEVICE" ] || [ -z "$BOOT_DEVICE" ]; then
#     echo "root or boot device is empty" >&2
#     exit 2
#   fi
#
#   if [ -z "$NEW_USER" ] || [ -z "$HOSTNAME" ]; then
#     echo "user or hostname is empty" >&2
#     exit 2
#   fi

first_field() {
  printf '%s\n' "$1" | awk '{ print $1 }'
}

ROOT_DEVICE="$(first_field "$ROOT_PARTITION_LINE")"
BOOT_DEVICE="$(first_field "$BOOT_PARTITION_LINE")"

# step 1: 格式化分区
echo "[step1]"
