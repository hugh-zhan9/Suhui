//
//  ItemPressableModule.swift
//  Pods
//
//  Created by Innei on 2025/4/15.
//

import ExpoModulesCore
import UIKit

public class ItemPressableModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ItemPressable")

    View(ItemPressableView.self) {
      OnViewDidUpdateProps { view in
        view.initizlize()
      }

      Prop("touchHighlight") { (view: ItemPressableView, value: Bool) in
        view.setTouchHighlight(value)
      }

      Events("onItemPress")
    }
  }
}

class ItemPressableView: ExpoView {
  private var onItemPress: EventDispatcher!
  private var touchHighlight = true
  required init(appContext: AppContext? = nil) {
    self.onItemPress = EventDispatcher()
    super.init(appContext: appContext)
  }

  func setTouchHighlight(_ value: Bool) {
    touchHighlight = value
  }

  func initizlize() {
    gestureRecognizers = [UITapGestureRecognizer(target: self, action: #selector(handleTap))]
  }

  @objc func handleTap() {
    let bgColor = layer.backgroundColor
    if touchHighlight {
      UIView.animate(withDuration: 0.2, delay: 0, options: [.curveEaseIn]) {
        self.layer.backgroundColor = UIColor.systemFill.cgColor
      } completion: { done in
        if done {
          UIView.animate(withDuration: 0.2, delay: 0.2, options: [.curveEaseOut]) {
            self.layer.backgroundColor = bgColor
          }
        }
      }
    }
    onItemPress()
  }
}
