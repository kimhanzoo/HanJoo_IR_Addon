# HanJoo IR

**HanJoo IR** là hệ thống quản lý và nhận diện thiết bị hồng ngoại dành cho Home Assistant. Mục tiêu là biến một bộ thu/phát IR giá rẻ thành hạ tầng IR dùng lâu dài: sau khi nạp ESPHome lần đầu, việc học mã, tìm thiết bị, tạo remote, điều hòa, quạt, media player và quản lý profile đều thực hiện trong **HanJoo IR Manager** trên Home Assistant.

## Điểm nổi bật

- **Kết hợp nhiều nguồn và nhiều engine IR** thay vì phụ thuộc vào một thư viện duy nhất. HanJoo tổng hợp kết quả từ HanJoo Core/Brain, IRremoteESP8266, irtxrx, thư viện/profile đã lưu, SmartIR và Flipper-IRDB khi được bật, sau đó đối chiếu và chấm điểm để tìm cấu hình phù hợp nhất cho thiết bị.
- **Nhận diện từ remote gốc**: thu nhiều mẫu IR, phân tích protocol/timing, gợi ý hãng/protocol/profile và chỉ đưa ra khuyến nghị tự động khi đủ bằng chứng.
- **Hỗ trợ thiết bị stateful như điều hòa** và các thiết bị thông thường như TV, quạt, loa, máy chiếu, đèn IR và remote tùy chỉnh.
- **Tích hợp trực tiếp Home Assistant**: thiết bị được đưa về entity phù hợp như `climate`, `fan`, `media_player`, `remote` để dùng trong Dashboard, Automation và Assist.
- **Local-first**: phát/thu và xử lý chính chạy trong mạng nội bộ; không cần cloud để điều khiển thiết bị IR.
- **One-install**: người dùng bình thường chỉ cần cài **HanJoo IR Core Add-on**. Add-on tự cài/cập nhật HanJoo IR Manager vào Home Assistant; HACS chỉ còn là lựa chọn thủ công/developer.
- **Đa nền tảng**: hỗ trợ Home Assistant OS trên **Intel/AMD x86-64 (`amd64`)** và **ARM64 (`aarch64`)**.

## Kiến trúc

```text
Home Assistant
├─ HanJoo IR Manager
│  ├─ giao diện quản lý
│  ├─ thiết bị / entity / profile người dùng
│  ├─ IR emitter/receiver bridge
│  └─ lưu dữ liệu cùng Home Assistant
│
└─ HanJoo IR Core Add-on
   ├─ Core gateway
   ├─ IRremoteESP8266 / irtxrx protocol engines
   └─ HanJoo Brain
      ├─ raw timing analysis
      ├─ protocol-family recognition
      ├─ profile/candidate scoring
      └─ safe recommendation policy
```

Dữ liệu thiết bị và mã IR của người dùng được Home Assistant quản lý để đi cùng hệ thống backup. Core chủ yếu đóng vai trò engine xử lý.

## Phần cứng cần thiết

Bạn chỉ cần **một thiết bị có khả năng phát và thu hồng ngoại**. Có hai lựa chọn phổ biến:

### 1. ESP32/ESP8266 + bộ phát/thu IR

- 1 board ESP tương thích ESPHome.
- 1 LED/mạch phát hồng ngoại.
- 1 mắt thu hồng ngoại 38 kHz.

### 2. Bộ điều khiển IR Tuya giá rẻ dùng chip Beken BK7231N

Nhiều IR blaster Tuya bán trên các sàn thương mại điện tử dùng **BK7231N** và có thể flash lại bằng ESPHome/LibreTiny. Sau khi xác định đúng GPIO của LED phát và mắt thu, cấu hình chúng thành IR proxy cho Home Assistant.

> GPIO dưới đây chỉ là ví dụ. **Hãy thay `pin: 7` và `number: 8` theo đúng phần cứng của bạn.**

```yaml
remote_transmitter:
  id: ir_tx
  pin: 7
  carrier_duty_percent: 50%

remote_receiver:
  id: ir_rx
  pin:
    number: 8
    inverted: true
    mode:
      input: true
      pullup: true
  tolerance: 55%
  filter: 50us
  idle: 10ms
  buffer_size: 2kb

  # Có thể giữ dump để debug; HanJoo IR Manager không cần đọc log này.
  dump: all

# ESPHome 2026.x native IR proxy:
# Home Assistant sẽ tạo 2 infrared entities dùng runtime,
# không cần compile lại firmware để học/phát mã mới.
infrared:
  - platform: ir_rf_proxy
    name: IR Transmitter
    remote_transmitter_id: ir_tx

  - platform: ir_rf_proxy
    name: IR Receiver
    receiver_frequency: 38kHz
    remote_receiver_id: ir_rx
```

Sau khi nạp firmware và Home Assistant nhìn thấy **IR Transmitter** + **IR Receiver**, về sau bạn **không cần sửa/nạp lại firmware chỉ để thêm remote hoặc thiết bị IR mới**. Việc học mã, nhận diện, tạo thiết bị và quản lý profile được thực hiện trong HanJoo IR Manager.

## Cài đặt trên Home Assistant

Repository Add-on chính thức của dự án:

**https://github.com/kimhanzoo/HanJoo_IR_Addon**

Trong Home Assistant:

1. Vào **Settings → Add-ons → Add-on Store**.
2. Mở menu **⋮ → Repositories**.
3. Thêm repository:

   ```text
   https://github.com/kimhanzoo/HanJoo_IR_Addon
   ```

4. Quay lại Add-on Store và cài **HanJoo IR Core**.
5. Bật **Start on boot** và khởi động add-on.
6. Add-on sẽ tự kiểm tra và cài/cập nhật **HanJoo IR Manager** vào Home Assistant.
7. Khi log báo Manager vừa được cài/cập nhật, **Restart Home Assistant Core một lần**.
8. Mở **HanJoo IR** trong Home Assistant, chọn IR Transmitter/Receiver và bắt đầu thêm thiết bị.

### HACS có bắt buộc không?

**Không.** Với cách cài khuyến nghị ở trên, Add-on tự quản lý Integration. Repository HACS chỉ giữ lại cho developer hoặc người muốn quản lý Integration riêng:

**https://github.com/kimhanzoo/hanjoo-ir-manager**

Nếu dùng HACS để quản lý Manager, hãy tắt tùy chọn `install_manager` trong HanJoo IR Core để tránh hai cơ chế cùng ghi đè Integration.

## Cập nhật

Mỗi bản phát hành tăng version của Add-on. Home Assistant sẽ hiện nút **Update** trong trang Add-on. Sau khi cập nhật:

```text
Update HanJoo IR Core
        ↓
Add-on khởi động lại
        ↓
Tự kiểm tra/cập nhật Manager đi kèm
        ↓
Restart Home Assistant Core nếu Manager thay đổi
```

Không cần gỡ Add-on rồi cài lại mỗi khi có phiên bản mới.

## Ghi chú

- GPIO của IR blaster Tuya/BK7231N khác nhau giữa từng PCB; phải xác định đúng chân trước khi flash.
- Khi dùng receiver 38 kHz, nên đặt mắt thu tránh ánh sáng mạnh và cách LED phát đủ xa để hạn chế tự thu tín hiệu vừa phát.
- HanJoo IR ưu tiên giữ dữ liệu thiết bị/profile ở Home Assistant; Core có thể được cập nhật hoặc cài lại mà không nên trở thành nơi duy nhất lưu dữ liệu người dùng.
