#!/bin/sh
set -eu

# 基础安装脚本入口。
# 这里先只保留变量说明和占位退出，你后续直接在这里写真正的安装逻辑。
#
# 环境变量说明：
#   INSTALL_PROFILE
#     类型：字符串。
#     当前脚本固定值：basic。
#     用法：通常不需要判断；如果你抽公共函数，可以用它区分安装类型。
#     示例：
#       if [ "$INSTALL_PROFILE" = "basic" ]; then
#         echo "running basic install"
#       fi
#
#   INSTALL_PROFILE_LABEL
#     类型：字符串。
#     当前脚本通常是：基础安装。
#     用法：只适合显示日志，不建议作为逻辑判断条件。
#
#   INSTALL_PROFILE_CUSTOM
#     类型：字符串布尔值，只会是 true 或 false。
#     当前脚本固定值：false。
#     用法：如果你写公共逻辑，可以这样判断：
#       if [ "$INSTALL_PROFILE_CUSTOM" = "true" ]; then
#         echo "custom profile"
#       else
#         echo "fixed profile"
#       fi
#
#   SYSTEM_LANG
#     类型：字符串。
#     来源：首页选择的 LANG。
#     例子：zh_CN.UTF-8、en_US.UTF-8、ja_JP.UTF-8、de_DE.UTF-8。
#     用法：写入目标系统的 locale 配置，例如 /mnt/etc/locale.conf。
#
#   SYSTEM_KEYMAP
#     类型：字符串。
#     来源：首页选择的键盘布局。
#     例子：us、de、fr、jp、uk。
#     用法：写入目标系统键盘配置，例如 /mnt/etc/vconsole.conf。
#
#   ROOT_PARTITION_LINE
#     类型：字符串。
#     内容：/ 分区在列表页中的整行文本，格式为：
#       设备路径  容量  当前文件系统  当前挂载点
#     例子：
#       /dev/sda2  80G  ext4  -
#       /dev/nvme0n1p2  120G  btrfs  -
#     注意：这是展示行，不要直接拿整行执行 mkfs/mount。
#     用法：用 first_field "$ROOT_PARTITION_LINE" 提取设备路径。
#
#   ROOT_MOUNT_POINT
#     类型：字符串。
#     当前固定值：/mnt。
#     用法：根分区 mount 目标。
#
#   ROOT_FORMAT
#     类型：字符串枚举。
#     可能值：preserve、ext4、btrfs、xfs、vfat、swap。
#     含义：用户选择的“目标格式化方式”，不是当前文件系统。
#     建议：根分区通常只接受 preserve/ext4/btrfs/xfs；遇到 vfat/swap 应该报错。
#     示例：
#       case "$ROOT_FORMAT" in
#         preserve) echo "keep existing root filesystem" ;;
#         ext4) mkfs.ext4 "$ROOT_DEVICE" ;;
#         btrfs) mkfs.btrfs -f "$ROOT_DEVICE" ;;
#         xfs) mkfs.xfs -f "$ROOT_DEVICE" ;;
#         *) echo "invalid root format: $ROOT_FORMAT" >&2; exit 2 ;;
#       esac
#
#   BOOT_PARTITION_LINE
#     类型：字符串。
#     内容：/boot 分区在列表页中的整行文本，格式同 ROOT_PARTITION_LINE。
#     例子：
#       /dev/sda1  512M  vfat  -
#       /dev/nvme0n1p1  1G  vfat  /mnt/boot
#     用法：用 first_field "$BOOT_PARTITION_LINE" 提取设备路径。
#
#   BOOT_MOUNT_POINT
#     类型：字符串。
#     当前固定值：/mnt/boot。
#     用法：boot 分区 mount 目标。
#
#   BOOT_FORMAT
#     类型：字符串枚举。
#     可能值：preserve、ext4、btrfs、xfs、vfat、swap。
#     含义：用户选择的 /boot 目标格式化方式。
#     建议：UEFI 常用 vfat；保留已有 EFI 分区时用 preserve；swap 通常应报错。
#     示例：
#       case "$BOOT_FORMAT" in
#         preserve) echo "keep existing boot filesystem" ;;
#         vfat) mkfs.fat -F32 "$BOOT_DEVICE" ;;
#         ext4) mkfs.ext4 "$BOOT_DEVICE" ;;
#         *) echo "invalid boot format: $BOOT_FORMAT" >&2; exit 2 ;;
#       esac
#
#   MOUNT_PLAN_COUNT
#     类型：数字字符串。
#     含义：用户在分区配置页保存了多少个分区配置。
#     用法：脚本侧兜底校验。
#     示例：
#       if [ "$MOUNT_PLAN_COUNT" -lt 2 ]; then
#         echo "missing mount plan" >&2
#         exit 2
#       fi
#
#   MOUNT_PLAN_TSV
#     类型：多行字符串。
#     含义：完整挂载计划，每行一个分区配置，可以遍历。
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
#     类型：字符串。
#     含义：安装完成后的普通用户用户名。
#     用法：useradd、passwd/chpasswd、sudoers 配置。
#
#   NEW_USER_PASSWORD
#     类型：字符串。
#     含义：普通用户密码。
#     注意：不要 echo 到日志；需要设置密码时用 chpasswd 或 passwd --stdin 这类方式。
#
#   ROOT_PASSWORD
#     类型：字符串。
#     含义：最终 root 密码。无论是否复用普通用户密码，都应该用这个变量设置 root 密码。
#
#   ROOT_PASSWORD_SAME_AS_USER
#     类型：字符串布尔值，只会是 true 或 false。
#     含义：用户在 TUI 中是否选择“root 密码与普通用户密码相同”。
#     用法：通常只用于日志或分支；设置 root 密码时直接用 ROOT_PASSWORD。
#     示例：
#       if [ "$ROOT_PASSWORD_SAME_AS_USER" = "true" ]; then
#         echo "root password reuses user password"
#       fi
#
#   HOSTNAME
#     类型：字符串。
#     含义：目标系统主机名。
#     用法：写入 /mnt/etc/hostname，或 arch-chroot 后调用 hostnamectl。
#
# 本脚本内部变量：
#   first_field()              从整行文本中取第一个字段，也就是设备路径
#   ROOT_DEVICE                从 ROOT_PARTITION_LINE 提取出来的设备名
#   BOOT_DEVICE                从 BOOT_PARTITION_LINE 提取出来的设备名
#
# 包选择说明：
#   基础安装不接收 INSTALL_PACKAGES_CSV；要装哪些包直接在本脚本里定义。
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

printf 'Basic install script is not implemented yet.\n' >&2
printf 'root=%s boot=%s hostname=%s user=%s\n' \
  "$ROOT_DEVICE" "$BOOT_DEVICE" "$HOSTNAME" "$NEW_USER" >&2
exit 64
