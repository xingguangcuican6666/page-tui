#!/bin/sh
set -eu

# 自定义安装脚本入口。
# 这里先只保留变量说明和占位退出，你后续在这里写自定义安装逻辑。
#
# 环境变量说明：
#   INSTALL_PROFILE
#     类型：字符串。
#     当前脚本固定值：custom。
#     示例：
#       if [ "$INSTALL_PROFILE" = "custom" ]; then
#         echo "running custom install"
#       fi
#
#   INSTALL_PROFILE_LABEL
#     类型：字符串。通常是“自定义安装”。
#     用法：只适合显示日志，不建议作为逻辑判断条件。
#
#   INSTALL_PROFILE_CUSTOM
#     类型：字符串布尔值，只会是 true 或 false。
#     当前脚本固定值：true。
#     示例：
#       if [ "$INSTALL_PROFILE_CUSTOM" = "true" ]; then
#         echo "custom package list is expected"
#       fi
#
#   INSTALL_PACKAGES_CSV
#     类型：字符串。
#     内容：逗号分隔的自定义包列表。
#     例子：base,linux,linux-firmware,git,vim。
#     空值条件：当前还没有自定义包选择页时，可能只有默认最小包列表。
#     用法：
#       INSTALL_PACKAGES="$(printf '%s\n' "$INSTALL_PACKAGES_CSV" | tr ',' ' ')"
#       for package in $INSTALL_PACKAGES; do
#         echo "package: $package"
#       done
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
#     用法：ROOT_DEVICE="$(first_field "$ROOT_PARTITION_LINE")"。
#
#   ROOT_MOUNT_POINT
#     类型：字符串。当前固定为 /mnt。
#
#   ROOT_FORMAT
#     类型：字符串枚举。
#     可能值：preserve、ext4、btrfs、xfs、vfat、swap。
#     含义：用户选择的目标格式化方式，不是当前文件系统。
#     示例：
#       case "$ROOT_FORMAT" in
#         preserve) ;;
#         ext4) mkfs.ext4 "$ROOT_DEVICE" ;;
#         btrfs) mkfs.btrfs -f "$ROOT_DEVICE" ;;
#         xfs) mkfs.xfs -f "$ROOT_DEVICE" ;;
#         *) echo "invalid root format: $ROOT_FORMAT" >&2; exit 2 ;;
#       esac
#
#   BOOT_PARTITION_LINE
#     类型：字符串。格式同 ROOT_PARTITION_LINE。
#     用法：BOOT_DEVICE="$(first_field "$BOOT_PARTITION_LINE")"。
#
#   BOOT_MOUNT_POINT
#     类型：字符串。当前固定为 /mnt/boot。
#
#   BOOT_FORMAT
#     类型：字符串枚举。
#     可能值：preserve、ext4、btrfs、xfs、vfat、swap。
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
#     示例：
#       if [ "$MOUNT_PLAN_COUNT" -lt 2 ]; then
#         echo "missing root or boot mount plan" >&2
#         exit 2
#       fi
#
#   MOUNT_PLAN_TSV
#     类型：多行字符串。
#     含义：完整挂载计划，每行一个分区配置。
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
#   INSTALL_PACKAGES           空格分隔包列表，便于脚本逐个处理
#
# 推荐的兜底校验模板：
#   if [ -z "$ROOT_DEVICE" ] || [ -z "$BOOT_DEVICE" ]; then
#     echo "root or boot device is empty" >&2
#     exit 2
#   fi
#
#   if [ -z "$INSTALL_PACKAGES" ]; then
#     echo "custom package list is empty" >&2
#     exit 2
#   fi

first_field() {
  printf '%s\n' "$1" | awk '{ print $1 }'
}

ROOT_DEVICE="$(first_field "$ROOT_PARTITION_LINE")"
BOOT_DEVICE="$(first_field "$BOOT_PARTITION_LINE")"
INSTALL_PACKAGES="$(printf '%s\n' "$INSTALL_PACKAGES_CSV" | tr ',' ' ')"

printf 'Custom install script is not implemented yet.\n' >&2
printf 'root=%s boot=%s hostname=%s user=%s packages=%s\n' \
  "$ROOT_DEVICE" "$BOOT_DEVICE" "$HOSTNAME" "$NEW_USER" "$INSTALL_PACKAGES" >&2
exit 64
