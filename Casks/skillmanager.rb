cask "skillmanager" do
  version "1.1.0"
  sha256 "92063f8f3cbe985541d2525a7337377119004d392e542b7f79296afc2ba01ef6"

  url "https://github.com/TudorAndrei/SkillManager/releases/download/v#{version}/SkillManager-macos-arm64.zip",
      verified: "github.com/TudorAndrei/SkillManager/"
  name "SkillManager"
  desc "Desktop front end for the skills CLI"
  homepage "https://github.com/TudorAndrei/SkillManager"

  livecheck do
    url :url
    strategy :github_latest
  end

  # The release workflow builds one macOS artifact, for Apple Silicon.
  depends_on arch: :arm64
  # The cask DSL compares with `>=`, so this means Monterey or newer. It matches
  # LSMinimumSystemVersion 12.0 in the packaged bundle.
  depends_on macos: :monterey

  app "SkillManager.app"

  zap trash: [
    "~/Library/Application Support/SkillManager",
    "~/Library/Preferences/dev.skillmanager.desktop.plist",
    "~/Library/Saved Application State/dev.skillmanager.desktop.savedState",
  ]

  caveats <<~EOS
    SkillManager is not signed or notarized by Apple, so macOS quarantines it.

    Either install it without the quarantine flag:
      brew install --cask --no-quarantine skillmanager

    or open the installed app once from the Finder context menu and confirm.

    The app carries its own copy of the skills CLI and its Node runtime, so no
    separate Node or skills installation is needed.
  EOS
end
