#!/usr/bin/env bash
# Runs a Gradle task in android/ with a JDK and SDK it can actually find.
#
#   pnpm android:apk       -> debug APK, for sideloading onto a phone
#   pnpm android:aab       -> release bundle, for the Play Console
#   scripts/android-build.sh <任意の gradle task>
#
# This exists because the JDK here is keg-only: Homebrew deliberately does not
# put it on PATH, so `./gradlew` on its own reports no Java runtime at all. The
# path is resolved rather than hard-coded so the script keeps working if the
# JDK is later installed some other way — an existing JAVA_HOME always wins.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -z "${JAVA_HOME:-}" ]]; then
  if /usr/libexec/java_home -v 21 >/dev/null 2>&1; then
    JAVA_HOME="$(/usr/libexec/java_home -v 21)"
  elif [[ -x /opt/homebrew/opt/openjdk@21/bin/java ]]; then
    JAVA_HOME=/opt/homebrew/opt/openjdk@21
  else
    echo "JDK 21을 찾지 못했어. brew install openjdk@21 로 설치하거나" >&2
    echo "JAVA_HOME을 직접 지정해줘." >&2
    exit 1
  fi
fi
export JAVA_HOME

export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
if [[ ! -d "$ANDROID_HOME" ]]; then
  echo "Android SDK를 찾지 못했어: $ANDROID_HOME" >&2
  exit 1
fi

# The bundle ships whatever is in android/app/src/main/assets/public, which
# `cap sync` copies out of dist/. Building the native side without doing that
# first silently packages the previous web build — the kind of mistake that is
# only visible once the APK is on a phone.
( cd "$ROOT" && pnpm build && npx cap sync android )

exec "$ROOT/android/gradlew" -p "$ROOT/android" "$@"
