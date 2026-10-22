package http

import (
	"testing"
)

func TestParseGitHubURL(t *testing.T) {
	cases := []struct {
		input       string
		wantOwner   string
		wantRepo    string
		wantBranch  string
		wantFile    string
		wantErr     bool
	}{
		{
			input:      "https://github.com/uet-arena/bot-template",
			wantOwner:  "uet-arena",
			wantRepo:   "bot-template",
			wantBranch: "main",
			wantFile:   "bot.py",
			wantErr:    false,
		},
		{
			input:      "https://github.com/sinhvien-k69/my-bot.git",
			wantOwner:  "sinhvien-k69",
			wantRepo:   "my-bot",
			wantBranch: "main",
			wantFile:   "bot.py",
			wantErr:    false,
		},
		{
			input:      "https://github.com/sinhvien-k69/my-bot/blob/dev/bot.cpp",
			wantOwner:  "sinhvien-k69",
			wantRepo:   "my-bot",
			wantBranch: "dev",
			wantFile:   "bot.cpp",
			wantErr:    false,
		},
		{
			input:      "https://raw.githubusercontent.com/alice/bob-bot/release-1/src/bot.py",
			wantOwner:  "alice",
			wantRepo:   "bob-bot",
			wantBranch: "release-1",
			wantFile:   "src/bot.py",
			wantErr:    false,
		},
		{
			input:      "k69-group/superbot",
			wantOwner:  "k69-group",
			wantRepo:   "superbot",
			wantBranch: "main",
			wantFile:   "bot.py",
			wantErr:    false,
		},
		{
			input:   "",
			wantErr: true,
		},
	}

	for _, tc := range cases {
		owner, repo, branch, file, err := parseGitHubURL(tc.input, "main", "bot.py")
		if tc.wantErr {
			if err == nil {
				t.Errorf("parseGitHubURL(%q) expected error, got nil", tc.input)
			}
			continue
		}
		if err != nil {
			t.Errorf("parseGitHubURL(%q) unexpected error: %v", tc.input, err)
			continue
		}
		if owner != tc.wantOwner || repo != tc.wantRepo || branch != tc.wantBranch || file != tc.wantFile {
			t.Errorf("parseGitHubURL(%q) = (%q, %q, %q, %q), want (%q, %q, %q, %q)",
				tc.input, owner, repo, branch, file, tc.wantOwner, tc.wantRepo, tc.wantBranch, tc.wantFile)
		}
	}
}
