// Package mailer gửi email giao dịch (mã khôi phục mật khẩu) qua SMTP, ví dụ Gmail với App password.
package mailer

import (
	"crypto/tls"
	"errors"
	"fmt"
	"mime"
	"net"
	"net/smtp"
	"os"
	"strings"
	"time"
)

type Sender interface {
	Send(to, subject, body string) error
	Configured() bool
}

// SMTP đọc cấu hình từ SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM.
type SMTP struct {
	Host, Port, User, Password, From string
}

func FromEnv() *SMTP {
	s := &SMTP{
		Host:     strings.TrimSpace(os.Getenv("SMTP_HOST")),
		Port:     strings.TrimSpace(os.Getenv("SMTP_PORT")),
		User:     strings.TrimSpace(os.Getenv("SMTP_USER")),
		Password: strings.ReplaceAll(os.Getenv("SMTP_PASSWORD"), " ", ""), // App password Gmail hay được dán kèm dấu cách
		From:     strings.TrimSpace(os.Getenv("SMTP_FROM")),
	}
	if s.Host == "" && s.User != "" {
		s.Host = "smtp.gmail.com"
	}
	if s.Port == "" {
		s.Port = "587"
	}
	if s.From == "" {
		s.From = s.User
	}
	return s
}

func (s *SMTP) Configured() bool { return s != nil && s.Host != "" && s.User != "" && s.Password != "" }

func (s *SMTP) Send(to, subject, body string) error {
	if !s.Configured() {
		return errors.New("SMTP chưa được cấu hình")
	}
	if strings.ContainsAny(to, "\r\n") || strings.ContainsAny(subject, "\r\n") {
		return errors.New("địa chỉ hoặc tiêu đề không hợp lệ")
	}
	msg := strings.Join([]string{
		"From: " + mime.QEncoding.Encode("utf-8", "BOT K69 ARENA") + " <" + s.From + ">",
		"To: " + to,
		"Subject: " + mime.QEncoding.Encode("utf-8", subject),
		"Date: " + time.Now().Format(time.RFC1123Z),
		"MIME-Version: 1.0",
		"Content-Type: text/plain; charset=UTF-8",
		"Content-Transfer-Encoding: 8bit",
		"",
		body,
	}, "\r\n")
	addr := net.JoinHostPort(s.Host, s.Port)
	conn, err := net.DialTimeout("tcp", addr, 10*time.Second)
	if err != nil {
		return fmt.Errorf("không kết nối được máy chủ mail: %w", err)
	}
	_ = conn.SetDeadline(time.Now().Add(30 * time.Second))
	var client *smtp.Client
	if s.Port == "465" {
		tlsConn := tls.Client(conn, &tls.Config{ServerName: s.Host})
		client, err = smtp.NewClient(tlsConn, s.Host)
	} else {
		client, err = smtp.NewClient(conn, s.Host)
		if err == nil {
			if ok, _ := client.Extension("STARTTLS"); ok {
				err = client.StartTLS(&tls.Config{ServerName: s.Host})
			}
		}
	}
	if err != nil {
		conn.Close()
		return err
	}
	defer client.Close()
	if ok, _ := client.Extension("AUTH"); ok {
		if err = client.Auth(smtp.PlainAuth("", s.User, s.Password, s.Host)); err != nil {
			return fmt.Errorf("đăng nhập SMTP thất bại: %w", err)
		}
	}
	if err = client.Mail(s.From); err != nil {
		return err
	}
	if err = client.Rcpt(to); err != nil {
		return err
	}
	w, err := client.Data()
	if err != nil {
		return err
	}
	if _, err = w.Write([]byte(msg)); err != nil {
		return err
	}
	if err = w.Close(); err != nil {
		return err
	}
	return client.Quit()
}
