package process

import "testing"

func TestExtractLocalURL(t *testing.T) {
	cases := []struct {
		in   string
		want string
		ok   bool
	}{
		{"  ➜  Local:   http://localhost:5173/", "http://localhost:5173", true},
		{"Local: http://127.0.0.1:3000", "http://localhost:3000", true},
		{"server ready on 0.0.0.0:8080", "", false},
	}
	for _, c := range cases {
		got, ok := ExtractLocalURL(c.in)
		if ok != c.ok || got != c.want {
			t.Fatalf("in=%q got=%q ok=%v want=%q/%v", c.in, got, ok, c.want, c.ok)
		}
	}
}

func TestGetServerStatusIdle(t *testing.T) {
	m := New(nil)
	if st := m.GetServerStatus("missing"); st != "idle" {
		t.Fatalf("got %s", st)
	}
}
